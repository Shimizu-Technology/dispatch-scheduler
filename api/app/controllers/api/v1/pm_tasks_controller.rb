module Api
  module V1
    class PmTasksController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :bulk_create, :bulk_complete, :update ]

      def index
        scope = PmTask.includes(:client, :location, :pm_template).order(:scheduled_date, :id)
        if params[:month].present?
          scope = scope.for_month(month_param)
        elsif params[:date].present?
          scope = scope.where(scheduled_date: date_param)
        end
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(locations: { region: params[:region] }) if params[:region].present?
        render json: scope.limit(300).map { |pm| Serializers.pm_task(pm) }
      end

      def create
        pm_task = nil
        ApplicationRecord.transaction do
          attrs = create_pm_task_params
          pm_task = build_pm_task(attrs)
          if duplicate_pm_task?(pm_task)
            render json: { errors: [ "PM already exists for this month, location, task, and scheduled date" ] }, status: :conflict
            raise ActiveRecord::Rollback
          end
          apply_location_region!(pm_task, attrs)
          pm_task.save!
          AuditEvent.record!(action: "pm_task.created", record: pm_task, user: current_user, metadata: pm_task_audit_metadata(pm_task))
        end
        render json: Serializers.pm_task(pm_task), status: :created if pm_task&.persisted?
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def bulk_create
        rows = bulk_rows
        raise ArgumentError, "Add at least one PM row" if rows.blank?
        raise ArgumentError, "Bulk PM setup is limited to 250 rows at a time" if rows.length > 250

        created = []
        created_signatures = {}
        duplicates = []
        invalid = []

        ApplicationRecord.transaction do
          rows.each_with_index do |row, index|
            row_params = row.respond_to?(:permit) ? row : ActionController::Parameters.new(row)
            pm_task = build_pm_task(row_params.permit(create_permitted_keys))
            signature = duplicate_signature(pm_task)
            if duplicate_pm_task?(pm_task) || created_signatures.key?(signature)
              duplicates << duplicate_payload(pm_task, index)
              next
            end

            if pm_task.valid?
              apply_location_region!(pm_task, row_params)
              pm_task.save!
              created_signatures[signature] = true
              created << pm_task
              AuditEvent.record!(action: "pm_task.created", record: pm_task, user: current_user, metadata: pm_task_audit_metadata(pm_task).merge(source: "bulk_month_setup"))
            else
              invalid << { index: index, errors: pm_task.errors.full_messages }
            end
          rescue ArgumentError => e
            invalid << { index: index, errors: [ e.message ] }
          end

          raise ActiveRecord::Rollback if invalid.present?
        end

        if invalid.present?
          render json: { errors: [ "Some PM rows could not be saved" ], invalid: invalid }, status: :unprocessable_entity
        else
          render json: {
            created: created.map { |pm| Serializers.pm_task(pm) },
            duplicates: duplicates,
            summary: { created_count: created.length, duplicate_count: duplicates.length }
          }, status: :created
        end
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def bulk_complete
        ids = bulk_pm_task_ids
        raise ArgumentError, "Choose at least one PM task to complete" if ids.blank?
        raise ArgumentError, "Station completion is limited to 100 PM tasks at a time" if ids.length > 100

        pm_tasks = PmTask.includes(:client, :location, :pm_template).where(id: ids).index_by(&:id)
        missing_ids = ids - pm_tasks.keys
        raise ActiveRecord::RecordNotFound, "Could not find PM tasks: #{missing_ids.join(', ')}" if missing_ids.any?

        completed_at = Time.current
        timing_attrs = pm_task_time_attributes(nil, bulk_complete_params)
        ApplicationRecord.transaction do
          ids.each do |id|
            pm_task = pm_tasks.fetch(id)
            pm_task.update!({ status: "completed", completed_at: pm_task.completed_at || completed_at, deferred_until: nil }.merge(timing_attrs))
            AuditEvent.record!(action: "pm_task.updated", record: pm_task, user: current_user, metadata: pm_task_audit_metadata(pm_task).merge(source: "station_completion"))
          end
        end

        render json: { pm_tasks: ids.map { |id| Serializers.pm_task(pm_tasks.fetch(id)) } }
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def update
        pm_task = PmTask.find(params[:id])
        attrs = pm_task_params
        raise ArgumentError, "Invalid PM status" if attrs[:status].present? && PmTask::STATUSES.exclude?(attrs[:status])

        ApplicationRecord.transaction do
          pm_task.update!(pm_task_record_attributes(pm_task, attrs))
          AuditEvent.record!(action: "pm_task.updated", record: pm_task, user: current_user, metadata: pm_task_audit_metadata(pm_task))
        end
        render json: Serializers.pm_task(pm_task)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      private

      def month_param
        Date.parse("#{params[:month]}-01")
      rescue Date::Error
        raise ActionController::BadRequest, "Invalid month"
      end

      def pm_task_params
        params.permit(:status, :completed_at, :deferred_until, :notes, :time_in_at, :time_out_at)
      end

      def bulk_complete_params
        params.permit(:time_in_at, :time_out_at)
      end

      def create_pm_task_params
        params.permit(create_permitted_keys)
      end

      def create_permitted_keys
        [
          :client, :location, :region, :task_name, :trade_category, :frequency,
          :scheduled_date, :due_on, :estimated_minutes, :notes, :source_file,
          :status, :time_in_at, :time_out_at
        ]
      end

      def bulk_rows
        rows = params[:pm_tasks] || params[:rows]
        rows.respond_to?(:to_unsafe_h) ? rows.to_unsafe_h.values : rows
      end

      def bulk_pm_task_ids
        Array(params[:pm_task_ids] || params[:ids]).reject(&:blank?).map(&:to_i).uniq
      end

      def build_pm_task(attrs)
        scheduled_date = parse_required_date(attrs[:scheduled_date], "scheduled date")
        client_name = attrs[:client].to_s.strip.presence || "Mobil"
        location_name = attrs[:location].to_s.strip.presence || raise(ArgumentError, "Location can't be blank")
        task_name = attrs[:task_name].to_s.strip.presence || raise(ArgumentError, "Task name can't be blank")
        status = attrs[:status].presence || "pending"
        raise ArgumentError, "Invalid PM status" if PmTask::STATUSES.exclude?(status)

        client = Client.find_or_create_by!(name: client_name)
        location = Location.find_or_initialize_by_normalized_name(client: client, name: location_name)
        location.region ||= attrs[:region].to_s.strip.presence || "Unknown"

        PmTask.new(
          client: client,
          location: location,
          task_name: task_name,
          trade_category: attrs[:trade_category].presence || "General",
          frequency: attrs[:frequency].presence || "monthly",
          scheduled_date: scheduled_date,
          due_on: attrs[:due_on].present? ? Date.parse(attrs[:due_on].to_s) : scheduled_date,
          estimated_minutes: attrs[:estimated_minutes].presence,
          status: status,
          time_in_at: parse_optional_time(attrs[:time_in_at], "time in"),
          time_out_at: parse_optional_time(attrs[:time_out_at], "time out"),
          notes: attrs[:notes].presence,
          source_file: attrs[:source_file].presence || "manual_pm_month_setup"
        )
      end

      def parse_required_date(value, label)
        raise ArgumentError, "#{label.capitalize} can't be blank" if value.blank?

        Date.parse(value.to_s)
      rescue Date::Error
        raise ArgumentError, "Invalid #{label}"
      end

      def parse_optional_time(value, label)
        return nil if value.blank?

        Time.zone.parse(value.to_s) || raise(ArgumentError, "Invalid #{label}")
      rescue ArgumentError, TypeError
        raise ArgumentError, "Invalid #{label}"
      end

      def apply_location_region!(pm_task, attrs)
        region = attrs[:region].to_s.strip.presence
        location = pm_task.location
        location.name = location.name.to_s.strip
        location.region = region if region.present? && location.region != region
        location.save! if location.changed? || location.new_record?
      end

      def duplicate_pm_task?(pm_task)
        return false unless pm_task.client_id && pm_task.location_id && pm_task.scheduled_date && pm_task.task_name.present?

        PmTask.where(client_id: pm_task.client_id, location_id: pm_task.location_id, scheduled_date: pm_task.scheduled_date)
          .where("LOWER(task_name) = ?", pm_task.task_name.downcase)
          .exists?
      end

      def duplicate_signature(pm_task)
        location_key = pm_task.location_id || pm_task.location&.name.to_s.downcase.strip
        [ pm_task.client_id, location_key, pm_task.scheduled_date, pm_task.task_name.to_s.downcase.strip ]
      end

      def duplicate_payload(pm_task, index)
        {
          index: index,
          client: pm_task.client.name,
          location: pm_task.location.name,
          task_name: pm_task.task_name,
          scheduled_date: pm_task.scheduled_date
        }
      end

      def pm_task_record_attributes(pm_task, attrs)
        status = attrs[:status].presence || pm_task.status
        completed_at = if status == "completed"
          attrs[:completed_at].present? ? Time.zone.parse(attrs[:completed_at].to_s) : pm_task.completed_at || Time.current
        else
          nil
        end
        deferred_until = if status == "deferred"
          attrs[:deferred_until].present? ? Date.parse(attrs[:deferred_until].to_s) : pm_task.deferred_until
        end
        {
          status: status,
          completed_at: completed_at,
          deferred_until: deferred_until,
          notes: attrs.key?(:notes) ? attrs[:notes] : pm_task.notes
        }.merge(pm_task_time_attributes(pm_task, attrs))
      rescue Date::Error
        raise ActionController::BadRequest, "Invalid deferred until"
      end

      def pm_task_time_attributes(pm_task, attrs)
        changes = {}
        changes[:time_in_at] = parse_optional_time(attrs[:time_in_at], "time in") if attrs.key?(:time_in_at)
        changes[:time_out_at] = parse_optional_time(attrs[:time_out_at], "time out") if attrs.key?(:time_out_at)
        changes[:time_in_at] = pm_task.time_in_at if pm_task&.respond_to?(:time_in_at) && !changes.key?(:time_in_at)
        changes[:time_out_at] = pm_task.time_out_at if pm_task&.respond_to?(:time_out_at) && !changes.key?(:time_out_at)
        changes
      end

      def pm_task_audit_metadata(pm_task)
        {
          task_name: pm_task.task_name,
          location: pm_task.location.name,
          scheduled_date: pm_task.scheduled_date,
          status: pm_task.status,
          deferred_until: pm_task.deferred_until,
          due_on: pm_task.respond_to?(:due_on) ? pm_task.due_on : nil,
          period_start: pm_task.respond_to?(:period_start) ? pm_task.period_start : nil,
          period_end: pm_task.respond_to?(:period_end) ? pm_task.period_end : nil,
          pm_template: pm_task.respond_to?(:pm_template) ? pm_task.pm_template&.name : nil,
          time_in_at: pm_task.respond_to?(:time_in_at) ? pm_task.time_in_at&.iso8601 : nil,
          time_out_at: pm_task.respond_to?(:time_out_at) ? pm_task.time_out_at&.iso8601 : nil,
          actual_duration_minutes: pm_task.respond_to?(:actual_duration_minutes) ? pm_task.actual_duration_minutes : nil
        }
      end
    end
  end
end
