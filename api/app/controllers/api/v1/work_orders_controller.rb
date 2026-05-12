module Api
  module V1
    class WorkOrdersController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create ]

      def index
        scope = WorkOrder.includes(:client, :location, :team).order(:scheduled_date, :id)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.joins(:location).where(locations: { region: params[:region] }) if params[:region].present?
        render json: scope.limit(200).map { |wo| Serializers.work_order(wo) }
      end

      def create
        client = Client.find_or_create_by!(name: params[:client].presence || "Manual")
        location = Location.find_or_create_by!(client: client, name: params[:location].presence || "Unknown") { |l| l.region = params[:region].presence || "Unknown" }
        wo = WorkOrder.create!(
          client: client,
          location: location,
          external_id: params[:external_id],
          source: "manual",
          title: params[:title].presence || params[:description].to_s.first(72),
          description: params[:description],
          priority: params[:priority].presence || "P4",
          normalized_priority: params[:normalized_priority].presence || params[:priority].presence || "P4",
          status: params[:status].presence || "new",
          original_status_text: params[:original_status_text].presence || params[:status].presence || "Manual entry",
          trade_category: params[:trade_category].presence || "General",
          notes: params[:notes]
        )
        render json: Serializers.work_order(wo), status: :created
      end
    end
  end
end
