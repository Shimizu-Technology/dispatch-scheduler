module Api
  module V1
    class TeamsController < ApplicationController
      def index
        date = Date.parse(params[:date].presence || Date.new(2026, 5, 1).to_s)
        render json: Team.includes(technicians: [ :technician_skills, :technician_availabilities ]).order(:name).map { |team| Serializers.team(team, date: date) }
      end
    end
  end
end
