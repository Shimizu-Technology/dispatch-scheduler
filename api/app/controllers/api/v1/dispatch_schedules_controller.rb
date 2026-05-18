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
        schedule = service.call
        render json: Serializers.schedule(schedule, summary: service.summary), status: :created
      end

      def show
        render json: Serializers.schedule(DispatchSchedule.find(params[:id]))
      end

      def whatsapp_export
        schedule = DispatchSchedule.includes(dispatch_items: [ :team, { work_order: [ :client, :location ] }, { pm_task: [ :client, :location ] } ]).find(params[:id])
        render json: { id: schedule.id, date: schedule.date, message: WhatsAppExportService.new(schedule).call }
      end

      def finalize
        schedule = DispatchSchedule.find(params[:id])
        return render json: { errors: [ "Sent schedules cannot be finalized again. Reopen first." ] }, status: :conflict if schedule.sent?

        schedule.finalize!(current_user)
        render json: Serializers.schedule(schedule)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def mark_sent
        schedule = DispatchSchedule.find(params[:id])
        schedule.mark_sent!(current_user)
        render json: Serializers.schedule(schedule)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def reopen
        schedule = DispatchSchedule.find(params[:id])
        schedule.reopen!
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
    end
  end
end
