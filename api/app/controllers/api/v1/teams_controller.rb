module Api
  module V1
    class TeamsController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :daily_memberships ]

      def index
        date = date_param
        teams = Team.order(:name).to_a
        team_ids = teams.map(&:id)
        daily_memberships = memberships_for(team_ids, date)
        default_memberships = memberships_for(team_ids, nil)

        render json: teams.map { |team| Serializers.team(team, date: date, daily_memberships: daily_memberships[team.id] || [], default_memberships: default_memberships[team.id] || []) }
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

      private

      def memberships_for(team_ids, date)
        TeamMembership
          .where(team_id: team_ids, date: date)
          .includes(technician: [ :technician_skills, :technician_availabilities ])
          .group_by(&:team_id)
      end
    end
  end
end
