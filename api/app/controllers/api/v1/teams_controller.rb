require "set"

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
        daily_override_team_ids = TeamDailyOverride.where(team_id: team_ids, date: date).pluck(:team_id).to_set

        render json: teams.map { |team| Serializers.team(team, date: date, daily_memberships: daily_memberships[team.id] || [], default_memberships: default_memberships[team.id] || [], daily_override: daily_override_team_ids.include?(team.id)) }
      end

      def daily_memberships
        team = Team.find(params[:id])
        date = date_param

        use_default = ActiveModel::Type::Boolean.new.cast(params[:use_default])
        technician_ids = use_default ? [] : Array(params[:technician_ids]).reject(&:blank?).map(&:to_i).uniq
        existing_ids = Technician.where(id: technician_ids).pluck(:id)
        missing_ids = technician_ids - existing_ids
        if missing_ids.any?
          return render json: { errors: [ "Technician(s) not found: #{missing_ids.join(', ')}" ] }, status: :unprocessable_entity
        end

        previous_ids = team.technicians_for_date(date).pluck(:id)
        default_ids = team.team_memberships.where(date: nil).pluck(:technician_id)
        applied_ids = use_default ? default_ids : existing_ids

        TeamMembership.transaction do
          team.team_memberships.where(date: date).delete_all
          if use_default
            team.team_daily_overrides.where(date: date).delete_all
          else
            team.team_daily_overrides.find_or_create_by!(date: date)
            existing_ids.each do |technician_id|
              team.team_memberships.create!(date: date, technician_id: technician_id)
            end
          end
          AuditEvent.record!(action: use_default ? "team.daily_crew.cleared" : "team.daily_crew.updated", record: team, user: current_user, metadata: {
            team: team.name,
            date: date,
            technician_ids: applied_ids,
            technician_names: technician_names(applied_ids),
            previous_technician_ids: previous_ids,
            previous_technician_names: technician_names(previous_ids)
          })
        end

        render json: Serializers.team(team.reload, date: date)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def technician_names(technician_ids)
        Technician.where(id: technician_ids).order(:name).pluck(:name)
      end

      def memberships_for(team_ids, date)
        TeamMembership
          .where(team_id: team_ids, date: date)
          .includes(technician: [ :technician_skills, :technician_availabilities ])
          .group_by(&:team_id)
      end
    end
  end
end
