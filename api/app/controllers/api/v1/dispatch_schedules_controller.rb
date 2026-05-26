module Api
  module V1
    class DispatchSchedulesController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :suggest, :finalize, :mark_sent, :reopen ]

      def index
        schedule = DispatchSchedule.where(date: schedule_date).order(status_order, created_at: :desc).first
        render json: { schedule: schedule ? Serializers.schedule(schedule) : nil }
      end

      def suggest
        locked_schedule = DispatchSchedule.where(date: schedule_date, status: %w[finalized sent]).first
        if locked_schedule
          return render json: { errors: [ "This schedule is #{locked_schedule.status}. Reopen it before regenerating." ] }, status: :conflict
        end

        service = DispatchSuggestionService.new(date: schedule_date)
        schedule = nil
        ApplicationRecord.transaction do
          schedule = service.call
          AuditEvent.record!(action: "dispatch_schedule.generated", record: schedule, user: current_user, metadata: {
            date: schedule.date,
            scheduled_items: service.summary[:scheduled_items],
            deferred_items: service.summary[:deferred_items],
            blocked_work_orders: service.summary[:blocked_work_orders]
          })
        end
        render json: Serializers.schedule(schedule, summary: service.summary), status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def show
        render json: Serializers.schedule(DispatchSchedule.find(params[:id]))
      end

      def whatsapp_export
        schedule = DispatchSchedule.includes(dispatch_items: [ :team, { work_order: [ :client, :location ] }, { pm_task: [ :client, :location ] } ]).find(params[:id])
        export = WhatsAppExportService.new(schedule)
        render json: { id: schedule.id, date: schedule.date, status: schedule.status, message: export.call, crews: export.crews }
      end

      def finalize
        schedule = DispatchSchedule.find(params[:id])
        return render json: { errors: [ "Sent schedules cannot be finalized again. Reopen first." ] }, status: :conflict if schedule.sent?
        return render json: Serializers.schedule(schedule) if schedule.finalized?

        ApplicationRecord.transaction do
          schedule.finalize!(current_user)
          transition_schedule_work_orders!(schedule, "scheduled")
          AuditEvent.record!(action: "dispatch_schedule.finalized", record: schedule, user: current_user, metadata: { date: schedule.date, status: schedule.status })
        end
        render json: Serializers.schedule(schedule)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def mark_sent
        schedule = DispatchSchedule.find(params[:id])
        return render json: Serializers.schedule(schedule) if schedule.sent?

        ApplicationRecord.transaction do
          schedule.mark_sent!(current_user)
          transition_schedule_work_orders!(schedule, "in_progress")
          AuditEvent.record!(action: "dispatch_schedule.sent", record: schedule, user: current_user, metadata: { date: schedule.date, status: schedule.status })
        end
        render json: Serializers.schedule(schedule)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def reopen
        schedule = DispatchSchedule.find(params[:id])
        previous_status = schedule.status
        ApplicationRecord.transaction do
          restore_schedule_work_orders!(schedule)
          schedule.reopen!
          AuditEvent.record!(action: "dispatch_schedule.reopened", record: schedule, user: current_user, metadata: { date: schedule.date, previous_status: previous_status })
        end
        render json: Serializers.schedule(schedule)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def schedule_date
        date_param
      end

      def status_order
        Arel.sql("CASE status WHEN 'sent' THEN 0 WHEN 'finalized' THEN 1 ELSE 2 END")
      end

      def transition_schedule_work_orders!(schedule, status)
        items = schedule.dispatch_items.includes(:work_order).where.not(work_order_id: nil)
        timestamp = Time.current
        items.each do |item|
          work_order = item.work_order
          next unless transitionable_work_order?(work_order, status)

          if item.previous_work_order_status.blank?
            item.update!(previous_work_order_status: work_order.status, previous_work_order_scheduled_date: work_order.scheduled_date)
          end
          work_order.update!(status: status, scheduled_date: schedule.date, updated_at: timestamp)
        end
      end

      def transitionable_work_order?(work_order, status)
        return false unless work_order&.archived_at.nil?
        return false unless work_order.open?
        return false if WorkOrder::BLOCKED_STATUSES.include?(work_order.status)
        return work_order.status == "scheduled" if status == "in_progress"

        true
      end

      def restore_schedule_work_orders!(schedule)
        schedule.dispatch_items.includes(:work_order).where.not(work_order_id: nil).find_each do |item|
          next if item.previous_work_order_status.blank?

          work_order = item.work_order
          if work_order&.archived_at.nil? && WorkOrder::STATUSES.include?(item.previous_work_order_status)
            restored_attrs = { scheduled_date: item.previous_work_order_scheduled_date }
            restored_attrs[:status] = item.previous_work_order_status if %w[scheduled in_progress].include?(work_order.status)
            work_order.update!(restored_attrs)
          end
          item.update!(previous_work_order_status: nil, previous_work_order_scheduled_date: nil)
        end
      end
    end
  end
end
