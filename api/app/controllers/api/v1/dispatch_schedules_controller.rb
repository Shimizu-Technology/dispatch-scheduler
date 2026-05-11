module Api
  module V1
    class DispatchSchedulesController < ApplicationController
      def suggest
        schedule = DispatchSuggestionService.new(date: params[:date].presence || Date.new(2026, 5, 1)).call
        render json: serialize_schedule(schedule), status: :created
      end

      def show
        render json: serialize_schedule(DispatchSchedule.find(params[:id]))
      end

      def whatsapp_export
        schedule = DispatchSchedule.includes(dispatch_items: [:team, { work_order: [:client, :location] }, { pm_task: [:client, :location] }]).find(params[:id])
        render json: { id: schedule.id, date: schedule.date, message: WhatsAppExportService.new(schedule).call }
      end

      private

      def serialize_schedule(schedule)
        schedule = DispatchSchedule.includes(dispatch_items: [:team, { work_order: [:client, :location] }, { pm_task: [:client, :location] }]).find(schedule.id)
        {
          id: schedule.id,
          date: schedule.date,
          status: schedule.status,
          items: schedule.dispatch_items.map { |item| Serializers.dispatch_item(item) }
        }
      end
    end
  end
end
