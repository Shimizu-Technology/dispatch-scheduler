module Api
  module V1
    class DispatchSchedulesController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :suggest ]

      def suggest
        service = DispatchSuggestionService.new(date: params[:date].presence || Date.new(2026, 5, 1))
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
    end
  end
end
