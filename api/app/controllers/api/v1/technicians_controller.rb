module Api
  module V1
    class TechniciansController < ApplicationController
      def index
        date = Date.parse(params[:date].presence || Date.new(2026, 5, 1).to_s)
        render json: Technician.includes(:technician_skills, :technician_availabilities).order(:name).map { |tech| Serializers.technician(tech, date: date) }
      end

      def update
        technician = Technician.find(params[:id])
        date = Date.parse(params[:date].presence || Date.current.to_s)
        availability = technician.technician_availabilities.find_or_initialize_by(date: date)
        availability.status = params[:availability].presence || "available"
        availability.reason = params[:reason]
        availability.save!
        render json: Serializers.technician(technician, date: date)
      end
    end
  end
end
