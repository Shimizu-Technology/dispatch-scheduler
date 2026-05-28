require "set"

module Api
  module V1
    class TeamsController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :update, :destroy, :daily_memberships ]

      def index
        date = date_param
        teams = Team.includes(:service_lines).order(:name)
        teams = teams.active unless params[:include_archived] == "true"
        teams = teams.to_a
        team_ids = teams.map(&:id)
        daily_memberships = memberships_for(team_ids, date)
        default_memberships = memberships_for(team_ids, nil)
        daily_override_team_ids = TeamDailyOverride.where(team_id: team_ids, date: date).pluck(:team_id).to_set

        render json: teams.map { |team| Serializers.team(team, date: date, daily_memberships: daily_memberships[team.id] || [], default_memberships: default_memberships[team.id] || [], daily_override: daily_override_team_ids.include?(team.id)) }
      end

      def create
        technician_ids = default_technician_ids
        return if performed?

        existing_ids = valid_technician_ids(technician_ids)
        return if performed?

        team = nil
        Team.transaction do
          team = Team.create!(name: team_name(existing_ids), region_preference: params[:region_preference].presence, crew_type: params[:crew_type].presence || "general", notes: params[:notes].presence || "Created in dispatch crew editor")
          existing_ids.each do |technician_id|
            team.team_memberships.create!(technician_id: technician_id)
          end
          replace_service_line_preferences!(team, service_line_ids) if params.key?(:service_line_ids)
          AuditEvent.record!(action: "team.created", record: team, user: current_user, metadata: {
            team: team.name,
            technician_ids: existing_ids,
            technician_names: technician_names(existing_ids),
            crew_type: team.crew_type,
            service_line_ids: team.service_line_ids
          })
        end

        render json: Serializers.team(team.reload, date: date_param), status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def update
        team = Team.find(params[:id])
        previous_name = team.name
        previous_region = team.region_preference
        previous_service_line_ids = team.service_line_ids
        previous_ids = team.team_memberships.where(date: nil).pluck(:technician_id)
        updates_memberships = params.key?(:technician_ids)
        requested_ids = updates_memberships ? default_technician_ids : previous_ids
        return if performed?

        existing_ids = valid_technician_ids(requested_ids)
        return if performed?

        next_name = params.key?(:name) ? team_name(existing_ids) : team.name
        next_region = params.key?(:region_preference) ? params[:region_preference].presence : team.region_preference
        next_crew_type = params.key?(:crew_type) ? params[:crew_type].presence || "general" : team.crew_type
        next_active = params.key?(:active) ? ActiveModel::Type::Boolean.new.cast(params[:active]) : team.active

        Team.transaction do
          team.update!(name: next_name, region_preference: next_region, crew_type: next_crew_type, active: next_active, archived_at: next_active ? nil : (team.archived_at || Time.current))
          if updates_memberships
            team.team_memberships.where(date: nil).delete_all
            existing_ids.each do |technician_id|
              team.team_memberships.create!(technician_id: technician_id)
            end
          end
          replace_service_line_preferences!(team, service_line_ids) if params.key?(:service_line_ids)
          AuditEvent.record!(action: "team.default_crew.updated", record: team, user: current_user, metadata: {
            team: team.name,
            previous_team: previous_name,
            region_preference: team.region_preference,
            previous_region_preference: previous_region,
            crew_type: team.crew_type,
            service_line_ids: team.service_line_ids,
            previous_service_line_ids: previous_service_line_ids,
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
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def destroy
        team = Team.find(params[:id])
        ApplicationRecord.transaction do
          team.update!(active: false, archived_at: Time.current)
          AuditEvent.record!(action: "team.archived", record: team, user: current_user, metadata: {
            team: team.name,
            technician_ids: team.team_memberships.where(date: nil).pluck(:technician_id),
            service_line_ids: team.service_line_ids
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
        existing_ids = Technician.active.where(id: technician_ids).pluck(:id)
        missing_ids = technician_ids - existing_ids
        if missing_ids.any?
          return render json: { errors: [ "Active technician(s) not found: #{missing_ids.join(', ')}" ] }, status: :unprocessable_entity
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

      def default_technician_ids
        technician_ids = Array(params[:technician_ids]).reject(&:blank?).map(&:to_i).uniq
        if technician_ids.empty?
          render json: { errors: [ "Select at least one technician for the default crew." ] }, status: :unprocessable_entity
        end
        technician_ids
      end

      def valid_technician_ids(technician_ids)
        existing_ids = Technician.active.where(id: technician_ids).pluck(:id)
        missing_ids = technician_ids - existing_ids
        if missing_ids.any?
          render json: { errors: [ "Active technician(s) not found: #{missing_ids.join(', ')}" ] }, status: :unprocessable_entity
        end
        existing_ids
      end

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

      def service_line_ids
        ids = Array(params[:service_line_ids]).reject(&:blank?).map(&:to_i).uniq
        existing_ids = ServiceLine.where(id: ids).pluck(:id)
        missing_ids = ids - existing_ids
        if missing_ids.any?
          raise ArgumentError, "Service line(s) not found: #{missing_ids.join(', ')}"
        end
        existing_ids
      end

      def replace_service_line_preferences!(team, ids)
        team.team_service_line_preferences.delete_all
        ids.each { |service_line_id| team.team_service_line_preferences.create!(service_line_id: service_line_id) }
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
