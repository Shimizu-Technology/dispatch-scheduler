module Api
  module V1
    class WorkOrdersController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :update, :archive, :unarchive, :update_status ]

      def index
        scope = WorkOrder.includes(:client, :location, :team, :service_line, dispatch_items: [ :team, :dispatch_schedule ])
        scope = archive_scope(scope)
        scope = scope.left_joins(:client, :location) if joined_filter_params?
        scope = scope.open if truthy_param?(:open)
        scope = scope.where(status: WorkOrder::CLOSED_STATUSES) if truthy_param?(:closed)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(normalized_priority: params[:priority]) if params[:priority].present?
        scope = scope.where(trade_category: params[:trade_category]) if params[:trade_category].present?
        scope = scope.where(source: params[:source]) if params[:source].present?
        scope = scope.where(service_line_id: params[:service_line_id]) if params[:service_line_id].present?
        scope = scope.where(pa_project: true) if truthy_param?(:pa_project)
        scope = scope.where(pa_project: [ false, nil ]) if truthy_param?(:exclude_pa)
        scope = scope.where(corrective_maintenance: true) if truthy_param?(:corrective_maintenance)
        scope = scope.where(estimate_required: true) if truthy_param?(:estimate_required)
        as_of = drilldown_date
        scope = scope.where("follow_up_due_on <= ?", as_of) if truthy_param?(:follow_up_due)
        scope = scope.where(parts_eta: ..(as_of + 7.days)) if truthy_param?(:parts_eta_due)
        scope = apply_sla_status(scope, params[:sla_status]) if params[:sla_status].present?
        scope = scope.where(scheduled_date: scheduled_date_param) if params[:scheduled_date].present?
        scope = scope.where("LOWER(clients.name) LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(params[:client].to_s.downcase)}%") if params[:client].present?
        scope = scope.where(locations: { region: params[:region] }) if params[:region].present?
        scope = apply_search(scope, params[:q]) if params[:q].present?
        scope = apply_sort(scope.distinct)
        unless paginated_request?
          return render json: scope.limit(200).map { |wo| Serializers.work_order(wo) }
        end

        total_count = scope.except(:select).count
        page = pagination_page
        per_page = pagination_per_page
        work_orders = scope.offset((page - 1) * per_page).limit(per_page).map { |wo| Serializers.work_order(wo) }

        render json: {
          work_orders: work_orders,
          meta: {
            page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil,
            sort: sort_param,
            direction: sort_direction,
            sub_counts: work_order_sub_counts(scope)
          }
        }
      end

      def show
        wo = WorkOrder.includes(:client, :location, :team, :service_line, dispatch_items: [ :team, :dispatch_schedule ]).find(params[:id])
        render json: Serializers.work_order(wo)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      end

      def create
        attrs = work_order_attrs
        wo = nil
        replayed = false
        if params.key?(:client_request_id)
          request_id = params[:client_request_id].to_s.strip.downcase
          unless WorkOrderCreateReceipt::UUID_FORMAT.match?(request_id)
            return render json: { errors: [ "Client request id must be a UUID" ] }, status: :unprocessable_entity
          end

          digest = WorkOrderCreateReceipt.fingerprint(attrs)
          receipt = WorkOrderCreateReceipt.create_or_find_by!(user_id: current_user.id, client_request_id: request_id) do |record|
            record.payload_digest = digest
          end
          receipt.with_lock do
            if receipt.payload_digest != digest
              render json: { errors: [ "This client request id was already used for different work-order details. Start a new request." ] }, status: :conflict
            elsif receipt.completed_at.present?
              wo = receipt.work_order
              if wo
                replayed = true
              else
                render json: { errors: [ "The work order saved for this request is no longer available." ] }, status: :conflict
              end
            else
              wo = persist_work_order(attrs)
              receipt.update!(work_order: wo, completed_at: Time.current) if wo && !performed?
            end
          end
        else
          wo = persist_work_order(attrs)
        end
        return if performed?

        render json: Serializers.work_order(wo), status: replayed ? :ok : :created
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def update
        wo = WorkOrder.find(params[:id])
        attrs = work_order_attrs
        expected_revision = expected_lock_version
        wo.with_lock do
          if expected_revision && wo.lock_version != expected_revision
            render_stale_work_order(wo)
            next
          end
          source = attrs[:source].presence || wo.source
          number = attrs.key?(:external_id) ? attrs[:external_id] : wo.external_id
          identity_changed = WorkOrderIdentityLock.normalized_pair(source, number) != WorkOrderIdentityLock.normalized_pair(wo.source, wo.external_id)
          WorkOrderIdentityLock.synchronize(source, number) do
            # Existing duplicate identities must remain editable until reconciled.
            duplicate = duplicate_work_order(source, number, excluding_id: wo.id) if identity_changed
            if duplicate
              render_duplicate(duplicate)
            else
              wo.update!(work_order_record_attributes(attrs, existing: wo))
              changes = wo.previous_changes.except("updated_at", "description", "notes")
              AuditEvent.record!(action: "work_order.updated", record: wo, user: current_user, metadata: work_order_audit_metadata(wo).merge(changes: changes))
            end
          end
        end
        return if performed?

        render json: Serializers.work_order(wo)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def archive
        wo = WorkOrder.find(params[:id])
        ApplicationRecord.transaction do
          wo.update!(archived_at: Time.current)
          AuditEvent.record!(action: "work_order.archived", record: wo, user: current_user, metadata: work_order_audit_metadata(wo))
        end
        render json: Serializers.work_order(wo)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def unarchive
        wo = WorkOrder.find(params[:id])
        ApplicationRecord.transaction do
          wo.update!(archived_at: nil)
          AuditEvent.record!(action: "work_order.unarchived", record: wo, user: current_user, metadata: work_order_audit_metadata(wo))
        end
        render json: Serializers.work_order(wo)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def update_status
        wo = WorkOrder.find(params[:id])
        status = params[:status].to_s
        raise ArgumentError, "Invalid work order status" unless WorkOrder::STATUSES.include?(status)

        previous_status = wo.status
        ApplicationRecord.transaction do
          wo.update!(status: status)
          AuditEvent.record!(action: "work_order.status_updated", record: wo, user: current_user, metadata: work_order_audit_metadata(wo).merge(previous_status: previous_status, new_status: wo.status))
        end
        render json: Serializers.work_order(wo)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      private

      def expected_lock_version
        return nil unless params.key?(:expected_lock_version)
        value = params[:expected_lock_version]
        valid = value.is_a?(Integer) && value >= 0
        valid ||= value.is_a?(String) && value.match?(/\A\d+\z/)
        raise ArgumentError, "Expected lock version must be a nonnegative integer" unless valid
        value.to_i
      end

      def archive_scope(scope)
        case params[:archived]
        when "all" then scope
        when "only" then scope.archived
        else scope.active_queue
        end
      end

      def joined_filter_params?
        params[:client].present? || params[:region].present? || params[:q].present?
      end

      def apply_search(scope, query)
        pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query.to_s.strip.downcase)}%"
        scope.where(
          "LOWER(work_orders.external_id) LIKE :q OR LOWER(work_orders.title) LIKE :q OR LOWER(work_orders.description) LIKE :q OR LOWER(work_orders.notes) LIKE :q OR LOWER(clients.name) LIKE :q OR LOWER(locations.name) LIKE :q",
          q: pattern
        )
      end

      def drilldown_date
        params[:as_of].present? ? Date.iso8601(params[:as_of].to_s) : Date.current
      rescue Date::Error
        raise ActionController::BadRequest, "Invalid as_of date"
      end

      def apply_sla_status(scope, status)
        case status.to_s
        when "overdue"
          scope.open.where(WorkOrder.sanitize_sql_array([ "#{WorkOrder.sla_due_sql} < ?", Time.current ]))
        when "due_soon"
          scope.open.where(WorkOrder.sanitize_sql_array([ "#{WorkOrder.sla_due_sql} >= ? AND #{WorkOrder.sla_due_sql} <= ?", Time.current, Time.current + 24.hours ]))
        when "missing"
          scope.open.where(reported_at: nil, assessment_due_at: nil, response_due_at: nil, repair_due_at: nil)
        when "on_track"
          scope.open.where.not(reported_at: nil).where(WorkOrder.sanitize_sql_array([ "#{WorkOrder.sla_due_sql} > ?", Time.current + 24.hours ]))
        else
          raise ActionController::BadRequest, "Invalid SLA status"
        end
      end

      def apply_sort(scope)
        direction = sort_direction_symbol
        case sort_param
        when "priority"
          scope.order(normalized_priority: direction, scheduled_date: :asc, id: :asc)
        when "status"
          scope.order(status: direction, scheduled_date: :asc, id: :asc)
        when "location"
          scope.left_joins(:location).select("work_orders.*", "locations.name AS queue_location_sort").order(Arel.sql(direction == :desc ? "queue_location_sort DESC" : "queue_location_sort ASC"), id: :asc)
        when "sla_due_at"
          # Project the missing-value rank so DISTINCT/ORDER BY is valid on
          # PostgreSQL and missing deadlines stay last on both database adapters.
          scope.select("work_orders.*", Arel.sql("#{WorkOrder.sla_due_sql} AS queue_sla_sort"), Arel.sql("CASE WHEN #{WorkOrder.sla_due_sql} IS NULL THEN 1 ELSE 0 END AS queue_sla_missing"))
            .order(Arel.sql(direction == :desc ? "queue_sla_missing ASC, queue_sla_sort DESC" : "queue_sla_missing ASC, queue_sla_sort ASC"), id: :asc)
        when "created_at"
          scope.order(created_at: direction, id: :asc)
        else
          scope.select("work_orders.*", Arel.sql("CASE WHEN work_orders.scheduled_date IS NULL THEN 1 ELSE 0 END AS queue_scheduled_missing"))
            .order(Arel.sql("queue_scheduled_missing ASC"), scheduled_date: direction, id: :asc)
        end
      end

      def paginated_request?
        params.key?(:page) || params.key?(:per_page) || params.key?(:sort) || params.key?(:direction)
      end

      def sort_param
        allowed = %w[scheduled_date created_at priority status location sla_due_at]
        allowed.include?(params[:sort].to_s) ? params[:sort].to_s : "scheduled_date"
      end

      def sort_direction
        params[:direction].to_s.downcase == "desc" ? "DESC" : "ASC"
      end

      def sort_direction_symbol
        params[:direction].to_s.downcase == "desc" ? :desc : :asc
      end

      def pagination_page
        [ params[:page].to_i, 1 ].max
      end

      def pagination_per_page
        requested = params[:per_page].to_i
        requested = 50 if requested <= 0
        requested.clamp(10, 100)
      end

      def work_order_sub_counts(scope)
        count_scope = scope.except(:select, :order, :limit, :offset)
        {
          waiting_for_parts: count_scope.where(status: "waiting_for_parts").count,
          estimate_required: count_scope.where(estimate_required: true).count,
          follow_up_due: count_scope.where.not(follow_up_due_on: nil).where("follow_up_due_on <= ?", Date.current).count
        }
      end

      def scheduled_date_param
        Date.parse(params[:scheduled_date].to_s)
      rescue Date::Error
        raise ActionController::BadRequest, "Invalid scheduled date"
      end

      def persist_work_order(attrs)
        wo = nil
        WorkOrderIdentityLock.synchronize(attrs[:source], attrs[:external_id]) do
          duplicate = duplicate_work_order(attrs[:source], attrs[:external_id])
          if duplicate
            render_duplicate(duplicate)
          else
            ApplicationRecord.transaction do
              wo = WorkOrder.create!(work_order_record_attributes(attrs))
              AuditEvent.record!(action: "work_order.created", record: wo, user: current_user, metadata: work_order_audit_metadata(wo))
            end
          end
        end
        wo
      end

      def work_order_record_attributes(attrs, existing: nil)
        client_name = attrs[:client].to_s.strip.presence || existing&.client&.name || "Manual"
        location_name = attrs[:location].to_s.strip.presence || existing&.location&.name || "Unknown"
        region = attrs[:region].to_s.strip.presence || existing&.location&.region || "Unknown"
        client = Client.find_or_create_by!(name: client_name)
        location = Location.find_or_initialize_by_normalized_name(client: client, name: location_name)
        location.name = location_name.to_s.strip if location.new_record? || existing.present?
        # Quick intake can leave the region unknown; preserve the shared site's
        # known region instead of resetting routing for its other work and PMs.
        if existing.nil? && location.persisted? && region == "Unknown" && location.region.present?
          region = location.region
        end
        location.region = region.presence || location.region.presence || "Unknown"
        location.save!

        priority = attrs[:priority].presence || existing&.priority || "P4"
        status = attrs[:status].presence || existing&.status || "new"
        raise ArgumentError, "Invalid work order status" unless WorkOrder::STATUSES.include?(status)

        description = attrs.key?(:description) ? attrs[:description].to_s.strip : existing&.description.to_s
        scheduled_date = if attrs.key?(:scheduled_date)
          attrs[:scheduled_date].present? ? Date.parse(attrs[:scheduled_date].to_s) : nil
        else
          existing&.scheduled_date
        end
        reported_at = datetime_attr(attrs, :reported_at, existing&.reported_at)

        {
          client: client,
          location: location,
          external_id: attrs.key?(:external_id) ? attrs[:external_id].presence : existing&.external_id,
          source: attrs[:source].presence || existing&.source || "manual",
          source_reference: attrs.key?(:source_reference) ? attrs[:source_reference].presence : existing&.source_reference,
          title: attrs[:title].presence || existing&.title || description.first(72).presence || "Work order",
          description: description,
          priority: priority,
          normalized_priority: attrs[:normalized_priority].presence || attrs[:priority].presence || existing&.normalized_priority || priority,
          status: status,
          original_status_text: attrs[:original_status_text].presence || existing&.original_status_text || status,
          trade_category: attrs[:trade_category].presence || existing&.trade_category || "General",
          requested_at: if attrs.key?(:requested_at)
            datetime_attr(attrs, :requested_at, existing&.requested_at)
                        elsif existing && reported_at == existing.reported_at
            existing.requested_at
                        else
            reported_at || existing&.requested_at
                        end,
          reported_at: reported_at,
          assessment_due_at: datetime_attr(attrs, :assessment_due_at, existing&.assessment_due_at),
          assessed_at: datetime_attr(attrs, :assessed_at, existing&.assessed_at),
          repair_due_at: datetime_attr(attrs, :repair_due_at, existing&.repair_due_at),
          scheduled_date: scheduled_date,
          estimated_hours: decimal_attr(attrs, :estimated_hours, existing&.estimated_hours),
          required_technician_count: integer_attr(attrs, :required_technician_count, existing&.required_technician_count || 1),
          notes: attrs.key?(:notes) ? attrs[:notes] : existing&.notes,
          service_line: service_line_for(attrs, existing),
          pa_project: boolean_attr(attrs, :pa_project, existing&.pa_project),
          pa_project_notes: attrs.key?(:pa_project_notes) ? attrs[:pa_project_notes] : existing&.pa_project_notes,
          corrective_maintenance: boolean_attr(attrs, :corrective_maintenance, existing&.corrective_maintenance),
          estimate_required: boolean_attr(attrs, :estimate_required, existing&.estimate_required),
          estimate_number: attrs.key?(:estimate_number) ? attrs[:estimate_number].presence : existing&.estimate_number,
          parts_status: attrs.key?(:parts_status) ? attrs[:parts_status].presence : existing&.parts_status,
          parts_ordered: boolean_attr(attrs, :parts_ordered, existing&.parts_ordered),
          parts_ordered_at: datetime_attr(attrs, :parts_ordered_at, existing&.parts_ordered_at),
          parts_eta: date_attr(attrs, :parts_eta, existing&.parts_eta),
          follow_up_due_on: date_attr(attrs, :follow_up_due_on, existing&.follow_up_due_on),
          follow_up_owner: attrs.key?(:follow_up_owner) ? attrs[:follow_up_owner].presence : existing&.follow_up_owner,
          vendor_reference: attrs.key?(:vendor_reference) ? attrs[:vendor_reference].presence : existing&.vendor_reference,
          latest_follow_up_note: attrs.key?(:latest_follow_up_note) ? attrs[:latest_follow_up_note].presence : existing&.latest_follow_up_note
        }
      rescue Date::Error
        raise ActionController::BadRequest, "Invalid scheduled date"
      end

      def work_order_audit_metadata(work_order)
        {
          title: work_order.title,
          external_id: work_order.external_id,
          client: work_order.client.name,
          location: work_order.location.name,
          status: work_order.status,
          priority: work_order.normalized_priority,
          trade_category: work_order.trade_category,
          service_line: work_order.service_line&.name,
          pa_project: work_order.pa_project,
          corrective_maintenance: work_order.corrective_maintenance,
          estimate_required: work_order.estimate_required,
          estimate_number: work_order.estimate_number,
          parts_status: work_order.parts_status,
          parts_ordered: work_order.parts_ordered,
          parts_eta: work_order.parts_eta,
          follow_up_due_on: work_order.follow_up_due_on,
          follow_up_owner: work_order.follow_up_owner,
          estimated_hours: work_order.estimated_hours&.to_f,
          required_technician_count: work_order.required_technician_count,
          sla_due_at: work_order.sla_due_at&.iso8601,
          sla_status: Serializers.sla_status(work_order)
        }
      end

      def service_line_for(attrs, existing)
        return existing&.service_line unless attrs.key?(:service_line_id)
        return nil if attrs[:service_line_id].blank?

        service_line = ServiceLine.find(attrs[:service_line_id])
        return service_line if service_line.active? || existing&.service_line_id == service_line.id

        raise ArgumentError, "Inactive service lines cannot be assigned to work orders"
      end

      def datetime_attr(attrs, key, fallback)
        return fallback unless attrs.key?(key)
        return nil if attrs[key].blank?

        Time.zone.parse(attrs[key].to_s)
      rescue ArgumentError, TypeError
        raise ActionController::BadRequest, "Invalid #{key.to_s.humanize.downcase}"
      end

      def decimal_attr(attrs, key, fallback)
        return fallback unless attrs.key?(key)
        return nil if attrs[key].blank?

        BigDecimal(attrs[key].to_s)
      rescue ArgumentError, TypeError
        raise ActionController::BadRequest, "Invalid #{key.to_s.humanize.downcase}"
      end

      def date_attr(attrs, key, fallback)
        return fallback unless attrs.key?(key)
        return nil if attrs[key].blank?

        Date.parse(attrs[key].to_s)
      rescue Date::Error, TypeError
        raise ActionController::BadRequest, "Invalid #{key.to_s.humanize.downcase}"
      end

      def integer_attr(attrs, key, fallback)
        return fallback unless attrs.key?(key)
        return nil if attrs[key].blank?

        Integer(attrs[key])
      rescue ArgumentError, TypeError
        raise ActionController::BadRequest, "Invalid #{key.to_s.humanize.downcase}"
      end

      def boolean_attr(attrs, key, fallback)
        return fallback || false unless attrs.key?(key)

        ActiveModel::Type::Boolean.new.cast(attrs[key])
      end

      def truthy_param?(key)
        ActiveModel::Type::Boolean.new.cast(params[key])
      end

      def duplicate_work_order(source, external_id, excluding_id: nil)
        normalized_source, normalized_number = WorkOrderIdentityLock.normalized_pair(source, external_id)
        return nil if normalized_number.nil?

        table = WorkOrder.arel_table
        source_node = Arel::Nodes::NamedFunction.new("COALESCE", [
          Arel::Nodes::NamedFunction.new("NULLIF", [ WorkOrderIdentityLock.normalized_node(table[:source]), Arel::Nodes.build_quoted("") ]),
          Arel::Nodes.build_quoted("manual")
        ])
        scope = WorkOrder.where(source_node.eq(normalized_source)).where(WorkOrderIdentityLock.normalized_node(table[:external_id]).eq(normalized_number))
        scope = scope.where.not(id: excluding_id) if excluding_id
        duplicate = scope.first
        return duplicate if duplicate

        # Ruby and database Unicode case folding can differ (notably SQLite).
        # Check only the slim identity projection when the fast SQL lookup misses.
        legacy = WorkOrder.where.not(external_id: [ nil, "" ])
        legacy = legacy.where.not(id: excluding_id) if excluding_id
        match = legacy.order(:id).pluck(:id, :source, :external_id).find do |_id, legacy_source, legacy_number|
          WorkOrderIdentityLock.normalized_pair(legacy_source, legacy_number) == [ normalized_source, normalized_number ]
        end
        WorkOrder.find(match.first) if match
      end

      def render_duplicate(work_order)
        render json: { errors: [ "A work order with this source and WO number already exists" ], duplicate: Serializers.work_order(work_order) }, status: :conflict
      end

      def work_order_attrs
        params.permit(
          :client,
          :location,
          :region,
          :external_id,
          :source,
          :source_reference,
          :title,
          :description,
          :priority,
          :normalized_priority,
          :status,
          :original_status_text,
          :trade_category,
          :scheduled_date,
          :requested_at,
          :reported_at,
          :assessment_due_at,
          :assessed_at,
          :repair_due_at,
          :estimated_hours,
          :required_technician_count,
          :notes,
          :service_line_id,
          :pa_project,
          :pa_project_notes,
          :corrective_maintenance,
          :estimate_required,
          :estimate_number,
          :parts_status,
          :parts_ordered,
          :parts_ordered_at,
          :parts_eta,
          :follow_up_due_on,
          :follow_up_owner,
          :vendor_reference,
          :latest_follow_up_note
        )
      end
    end
  end
end
