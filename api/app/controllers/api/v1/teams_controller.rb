require "set"

module Api
  module V1
    class TeamsController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :update, :daily_memberships ]

      def index
        date = date_param
        teams = Team.order(:name).to_a
        team_ids = teams.map(&:id)
        daily_memberships = memberships_for(team_ids, date)
        default_memberships = memberships_for(team_ids, nil)
        daily_override_team_ids = TeamDailyOverride.where(team_id: team_ids, date: date).pluck(:team_id).to_set

        render json: teams.map { |team| Serializers.team(team, date: date, daily_memberships: daily_memberships[team.id] || [], default_memberships: default_memberships[team.id] || [], daily_override: daily_override_team_ids.include?(team.id)) }
      end

      def create
        technician_ids = Array(params[:technician_ids]).reject(&:blank?).map(&:to_i).uniq
        existing_ids = Technician.where(id: technician_ids).pluck(:id)
        missing_ids = technician_ids - existing_ids
        if missing_ids.any?
          return render json: { errors: [ "Technician(s) not found: #{missing_ids.join(', ')}" ] }, status: :unprocessable_entity
        end

        team = nil
        Team.transaction do
          team = Team.create!(name: team_name(existing_ids), region_preference: params[:region_preference].presence, notes: params[:notes].presence || "Created in dispatch crew editor")
          existing_ids.each do |technician_id|
            team.team_memberships.create!(technician_id: technician_id)
          end
          AuditEvent.record!(action: "team.created", record: team, user: current_user, metadata: {
            team: team.name,
            technician_ids: existing_ids,
            technician_names: technician_names(existing_ids)
          })
        end

        render json: Serializers.team(team.reload, date: date_param), status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def update
        team = Team.find(params[:id])
        previous_name = team.name
        previous_region = team.region_preference
        previous_ids = team.team_memberships.where(date: nil).pluck(:technician_id)
        updates_memberships = params.key?(:technician_ids)
        requested_ids = updates_memberships ? Array(params[:technician_ids]).reject(&:blank?).map(&:to_i).uniq : previous_ids
        existing_ids = Technician.where(id: requested_ids).pluck(:id)
        missing_ids = requested_ids - existing_ids
        if missing_ids.any?
          return render json: { errors: [ "Technician(s) not found: #{missing_ids.join(', ')}" ] }, status: :unprocessable_entity
        end

        next_name = params.key?(:name) ? team_name(existing_ids) : team.name
        next_region = params.key?(:region_preference) ? params[:region_preference].presence : team.region_preference

        Team.transaction do
          team.update!(name: next_name, region_preference: next_region)
          if updates_memberships
            team.team_memberships.where(date: nil).delete_all
            existing_ids.each do |technician_id|
              team.team_memberships.create!(technician_id: technician_id)
            end
          end
          AuditEvent.record!(action: "team.default_crew.updated", record: team, user: current_user, metadata: {
            team: team.name,
            previous_team: previous_name,
            region_preference: team.region_preference,
            previous_region_preference: previous_region,
            technician_ids: existing_ids,
            technician_names: technician_names(existing_ids),
            previous_technician_ids: previous_ids,
            previous_technician_names: technician_names(previous_ids)
          })
        end

        render json: Serializers.team(team.reload, date: date_param)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
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

      def team_name(technician_ids)
        explicit_name = params[:name].to_s.strip
        return explicit_name if explicit_name.present?

        names = technician_names(technician_ids)
        return "New Crew" if names.empty?

        names.join(" / ")
      end

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
