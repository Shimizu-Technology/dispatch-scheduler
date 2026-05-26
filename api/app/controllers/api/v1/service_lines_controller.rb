module Api
  module V1
    class ServiceLinesController < ApplicationController
      before_action :require_admin!, only: [ :create, :update ]

      def index
        scope = ServiceLine.ordered
        scope = scope.active unless params[:include_inactive] == "true"
        render json: { service_lines: scope.map { |service_line| Serializers.service_line(service_line) } }
      end

      def create
        service_line = ServiceLine.create!(service_line_params_with_defaults)
        AuditEvent.record!(action: "service_line.created", record: service_line, user: current_user, metadata: service_line_audit_metadata(service_line))
        render json: { service_line: Serializers.service_line(service_line) }, status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def update
        service_line = ServiceLine.find(params[:id])
        service_line.update!(service_line_params)
        AuditEvent.record!(action: "service_line.updated", record: service_line, user: current_user, metadata: service_line_audit_metadata(service_line))
        render json: { service_line: Serializers.service_line(service_line) }
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def service_line_params_with_defaults
        attrs = service_line_params
        attrs[:position] = next_position unless attrs.key?(:position)
        attrs
      end

      def service_line_params
        params.permit(:name, :position, :active, :notes)
      end

      def next_position
        ServiceLine.maximum(:position).to_i + 10
      end

      def service_line_audit_metadata(service_line)
        {
          name: service_line.name,
          position: service_line.position,
          active: service_line.active
        }
      end
    end
  end
end
