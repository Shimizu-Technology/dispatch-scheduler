module Api
  module V1
    class PmTasksController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :update ]

      def index
        scope = PmTask.includes(:client, :location).order(:scheduled_date, :id)
        if params[:month].present?
          scope = scope.for_month(month_param)
        elsif params[:date].present?
          scope = scope.where(scheduled_date: date_param)
        end
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(locations: { region: params[:region] }) if params[:region].present?
        render json: scope.limit(300).map { |pm| Serializers.pm_task(pm) }
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
        params.permit(:status, :completed_at, :deferred_until, :notes)
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
        }
      rescue Date::Error
        raise ActionController::BadRequest, "Invalid deferred until"
      end

      def pm_task_audit_metadata(pm_task)
        {
          task_name: pm_task.task_name,
          location: pm_task.location.name,
          scheduled_date: pm_task.scheduled_date,
          status: pm_task.status,
          deferred_until: pm_task.deferred_until
        }
      end
    end
  end
end
