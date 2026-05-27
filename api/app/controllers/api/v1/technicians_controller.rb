module Api
  module V1
    class TechniciansController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :update, :destroy ]

      def index
        date = date_param
        scope = Technician.includes(:technician_skills, :technician_availabilities).order(:name)
        scope = scope.active unless params[:include_inactive] == "true"
        render json: scope.map { |tech| Serializers.technician(tech, date: date) }
      end

      def create
        technician = nil
        ApplicationRecord.transaction do
          technician = Technician.create!(roster_attrs(for_create: true))
          replace_skills!(technician, skill_names) if params.key?(:skills)
          AuditEvent.record!(action: "technician.created", record: technician, user: current_user, metadata: technician_audit_metadata(technician))
        end
        render json: Serializers.technician(technician.reload, date: date_param), status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def update
        technician = Technician.find(params[:id])
        date = date_param

        ApplicationRecord.transaction do
          if roster_update?
            technician.update!(roster_attrs)
            replace_skills!(technician, skill_names) if params.key?(:skills)
            AuditEvent.record!(action: "technician.updated", record: technician, user: current_user, metadata: technician_audit_metadata(technician))
          end

          if params.key?(:availability) || params.key?(:reason)
            availability = technician.technician_availabilities.find_or_initialize_by(date: date)
            availability.status = params[:availability].presence || "available"
            availability.reason = params[:reason]
            availability.save!
            AuditEvent.record!(action: "technician_availability.updated", record: technician, user: current_user, metadata: technician_audit_metadata(technician).merge(date: date, availability: availability.status, reason: availability.reason))
          end
        end
        render json: Serializers.technician(technician.reload, date: date)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def destroy
        technician = Technician.find(params[:id])
        ApplicationRecord.transaction do
          technician.update!(active: false)
          AuditEvent.record!(action: "technician.archived", record: technician, user: current_user, metadata: technician_audit_metadata(technician))
        end
        render json: Serializers.technician(technician, date: date_param)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def roster_update?
        [ :name, :primary_trade, :is_driver, :active, :notes, :skills ].any? { |key| params.key?(key) }
      end

      def roster_attrs(for_create: false)
        attrs = {}
        attrs[:name] = params[:name].to_s.strip if params.key?(:name)
        attrs[:primary_trade] = params[:primary_trade].presence || "General" if params.key?(:primary_trade)
        attrs[:is_driver] = ActiveModel::Type::Boolean.new.cast(params[:is_driver]) if params.key?(:is_driver)
        attrs[:active] = ActiveModel::Type::Boolean.new.cast(params[:active]) if params.key?(:active)
        attrs[:notes] = params[:notes] if params.key?(:notes)
        if for_create
          attrs[:active] = true unless attrs.key?(:active)
          attrs[:is_driver] = false unless attrs.key?(:is_driver)
        end
        attrs
      end

      def skill_names
        Array(params[:skills]).map { |skill| skill.to_s.strip }.reject(&:blank?).uniq
      end

      def replace_skills!(technician, skills)
        technician.technician_skills.delete_all
        skills.each { |skill| technician.technician_skills.create!(skill: skill) }
      end

      def technician_audit_metadata(technician)
        {
          technician: technician.name,
          primary_trade: technician.primary_trade,
          skills: technician.technician_skills.order(:skill).pluck(:skill),
          is_driver: technician.is_driver,
          active: technician.active
        }
      end
    end
  end
end
