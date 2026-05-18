module Api
  module V1
    class TeamsController < ApplicationController
      def index
        date = date_param
        render json: Team.includes(technicians: [ :technician_skills, :technician_availabilities ]).order(:name).map { |team| Serializers.team(team, date: date) }
      end
    end
  end
end
