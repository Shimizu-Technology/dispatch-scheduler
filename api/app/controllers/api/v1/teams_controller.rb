module Api
  module V1
    class TeamsController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :daily_memberships ]

      def index
        date = date_param
        render json: Team.includes(technicians: [ :technician_skills, :technician_availabilities ]).order(:name).map { |team| Serializers.team(team, date: date) }
      end

      def daily_memberships
        team = Team.find(params[:id])
        date = date_param

        use_default = ActiveModel::Type::Boolean.new.cast(params[:use_default])
        technician_ids = use_default ? [] : Array(params[:technician_ids]).map(&:to_i).uniq
        existing_ids = Technician.where(id: technician_ids).pluck(:id)
        missing_ids = technician_ids - existing_ids
        if missing_ids.any?
          return render json: { errors: [ "Technician(s) not found: #{missing_ids.join(', ')}" ] }, status: :unprocessable_entity
        end

        TeamMembership.transaction do
          team.team_memberships.where(date: date).delete_all
          existing_ids.each do |technician_id|
            team.team_memberships.create!(date: date, technician_id: technician_id)
          end
        end

        render json: Serializers.team(team.reload, date: date)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end
    end
  end
end
