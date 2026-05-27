module Api
  module V1
    class WorkOrdersController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :update, :archive, :unarchive, :update_status ]

      def index
        scope = WorkOrder.includes(:client, :location, :team, :service_line, dispatch_items: [ :team, :dispatch_schedule ])
        scope = archive_scope(scope)
        scope = scope.left_joins(:client, :location) if joined_filter_params?
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(normalized_priority: params[:priority]) if params[:priority].present?
        scope = scope.where(trade_category: params[:trade_category]) if params[:trade_category].present?
        scope = scope.where(source: params[:source]) if params[:source].present?
        scope = scope.where(service_line_id: params[:service_line_id]) if params[:service_line_id].present?
        scope = scope.where(pa_project: true) if truthy_param?(:pa_project)
        scope = scope.where(corrective_maintenance: true) if truthy_param?(:corrective_maintenance)
        scope = scope.where(estimate_required: true) if truthy_param?(:estimate_required)
        scope = scope.where(scheduled_date: scheduled_date_param) if params[:scheduled_date].present?
        scope = scope.where("clients.name LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(params[:client])}%") if params[:client].present?
        scope = scope.where(locations: { region: params[:region] }) if params[:region].present?
        scope = apply_search(scope, params[:q]) if params[:q].present?
        scope = apply_sort(scope.distinct)
        unless paginated_request?
          return render json: scope.limit(200).map { |wo| Serializers.work_order(wo) }
        end

        total_count = scope.count
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
            direction: sort_direction
          }
        }
      end

      def create
        attrs = work_order_attrs
        duplicate = duplicate_work_order(attrs[:source], attrs[:external_id])
        if duplicate
          return render json: { errors: [ "A work order with this source and WO number already exists" ], duplicate: Serializers.work_order(duplicate) }, status: :conflict
        end

        wo = nil
        ApplicationRecord.transaction do
          wo = WorkOrder.create!(work_order_record_attributes(attrs))
          AuditEvent.record!(action: "work_order.created", record: wo, user: current_user, metadata: work_order_audit_metadata(wo))
        end
        render json: Serializers.work_order(wo), status: :created
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
        duplicate = duplicate_work_order(attrs[:source].presence || wo.source, attrs.key?(:external_id) ? attrs[:external_id] : wo.external_id, excluding_id: wo.id)
        if duplicate
          return render json: { errors: [ "A work order with this source and WO number already exists" ], duplicate: Serializers.work_order(duplicate) }, status: :conflict
        end

        ApplicationRecord.transaction do
          wo.update!(work_order_record_attributes(attrs, existing: wo))
          changes = wo.previous_changes.except("updated_at", "description", "notes")
          AuditEvent.record!(action: "work_order.updated", record: wo, user: current_user, metadata: work_order_audit_metadata(wo).merge(changes: changes))
        end
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
        pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query.to_s.strip)}%"
        scope.where(
          "work_orders.external_id LIKE :q OR work_orders.title LIKE :q OR work_orders.description LIKE :q OR work_orders.notes LIKE :q OR clients.name LIKE :q OR locations.name LIKE :q",
          q: pattern
        )
      end

      def apply_sort(scope)
        direction = sort_direction_symbol
        case sort_param
        when "priority"
          scope.order(normalized_priority: direction, scheduled_date: :asc, id: :asc)
        when "status"
          scope.order(status: direction, scheduled_date: :asc, id: :asc)
        when "location"
          scope.left_joins(:location).order(locations: { name: direction }).order(id: :asc)
        when "sla_due_at"
          scope.order(Arel.sql(direction == :desc ? "COALESCE(work_orders.repair_due_at, work_orders.assessment_due_at, work_orders.response_due_at) DESC" : "COALESCE(work_orders.repair_due_at, work_orders.assessment_due_at, work_orders.response_due_at) ASC"), id: :asc)
        when "created_at"
          scope.order(created_at: direction, id: :asc)
        else
          scope.order(scheduled_date: direction, id: :asc)
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

      def scheduled_date_param
        Date.parse(params[:scheduled_date].to_s)
      rescue Date::Error
        raise ActionController::BadRequest, "Invalid scheduled date"
      end

      def work_order_record_attributes(attrs, existing: nil)
        client_name = attrs[:client].presence || existing&.client&.name || "Manual"
        location_name = attrs[:location].presence || existing&.location&.name || "Unknown"
        region = attrs[:region].presence || existing&.location&.region || "Unknown"
        client = Client.find_or_create_by!(name: client_name)
        location = Location.find_or_initialize_by(client: client, name: location_name)
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
          requested_at: reported_at || datetime_attr(attrs, :requested_at, existing&.requested_at),
          reported_at: reported_at,
          assessment_due_at: datetime_attr(attrs, :assessment_due_at, existing&.assessment_due_at),
          assessed_at: datetime_attr(attrs, :assessed_at, existing&.assessed_at),
          repair_due_at: datetime_attr(attrs, :repair_due_at, existing&.repair_due_at),
          scheduled_date: scheduled_date,
          notes: attrs.key?(:notes) ? attrs[:notes] : existing&.notes,
          service_line: service_line_for(attrs, existing),
          pa_project: boolean_attr(attrs, :pa_project, existing&.pa_project),
          pa_project_notes: attrs.key?(:pa_project_notes) ? attrs[:pa_project_notes] : existing&.pa_project_notes,
          corrective_maintenance: boolean_attr(attrs, :corrective_maintenance, existing&.corrective_maintenance),
          estimate_required: boolean_attr(attrs, :estimate_required, existing&.estimate_required)
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

      def boolean_attr(attrs, key, fallback)
        return fallback || false unless attrs.key?(key)

        ActiveModel::Type::Boolean.new.cast(attrs[key])
      end

      def truthy_param?(key)
        ActiveModel::Type::Boolean.new.cast(params[key])
      end

      def duplicate_work_order(source, external_id, excluding_id: nil)
        return nil if external_id.blank?

        scope = WorkOrder.where(source: source.presence || "manual", external_id: external_id)
        scope = scope.where.not(id: excluding_id) if excluding_id
        scope.first
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
          :notes,
          :service_line_id,
          :pa_project,
          :pa_project_notes,
          :corrective_maintenance,
          :estimate_required
        )
      end
    end
  end
end
