module Api
  module V1
    class WorkOrdersController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :update, :archive, :unarchive, :update_status ]

      def index
        scope = WorkOrder.includes(:client, :location, :team, dispatch_items: [ :team, :dispatch_schedule ]).order(:scheduled_date, :id)
        scope = archive_scope(scope)
        scope = scope.left_joins(:client, :location) if joined_filter_params?
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(normalized_priority: params[:priority]) if params[:priority].present?
        scope = scope.where(trade_category: params[:trade_category]) if params[:trade_category].present?
        scope = scope.where(source: params[:source]) if params[:source].present?
        scope = scope.where(scheduled_date: scheduled_date_param) if params[:scheduled_date].present?
        scope = scope.where("clients.name LIKE ?", "%#{ActiveRecord::Base.sanitize_sql_like(params[:client])}%") if params[:client].present?
        scope = scope.where(locations: { region: params[:region] }) if params[:region].present?
        scope = apply_search(scope, params[:q]) if params[:q].present?
        render json: scope.distinct.limit(200).map { |wo| Serializers.work_order(wo) }
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
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
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
          scheduled_date: scheduled_date,
          notes: attrs.key?(:notes) ? attrs[:notes] : existing&.notes
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
          trade_category: work_order.trade_category
        }
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
          :notes
        )
      end
    end
  end
end
