module Api
  module V1
    class TechniciansController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :update ]

      def index
        date = date_param
        render json: Technician.includes(:technician_skills, :technician_availabilities).order(:name).map { |tech| Serializers.technician(tech, date: date) }
      end

      def update
        technician = Technician.find(params[:id])
        date = date_param
        availability = technician.technician_availabilities.find_or_initialize_by(date: date)
        availability.status = params[:availability].presence || "available"
        availability.reason = params[:reason]
        ApplicationRecord.transaction do
          availability.save!
          AuditEvent.record!(action: "technician_availability.updated", record: technician, user: current_user, metadata: {
            technician: technician.name,
            date: date,
            availability: availability.status,
            reason: availability.reason
          })
        end
        render json: Serializers.technician(technician, date: date)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end
    end
  end
end
