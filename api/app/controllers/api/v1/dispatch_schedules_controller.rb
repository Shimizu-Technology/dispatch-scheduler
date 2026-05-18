module Api
  module V1
    class DispatchSchedulesController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :suggest ]

      def index
        schedule = DispatchSchedule.where(date: schedule_date).order(created_at: :desc).first
        render json: { schedule: schedule ? Serializers.schedule(schedule) : nil }
      end

      def suggest
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

      private

      def schedule_date
        date_param
      end
    end
  end
end
