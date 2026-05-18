module Api
  module V1
    class AuditEventsController < ApplicationController
      def index
        scope = ::AuditEvent.includes(:user).order(occurred_at: :desc, id: :desc)
        scope = scope.where(record_type: params[:record_type]) if params[:record_type].present?
        scope = scope.where(record_id: params[:record_id]) if params[:record_id].present?
        scope = scope.where(action: params[:event_action]) if params[:event_action].present?
        render json: { audit_events: scope.limit(limit).map { |event| Serializers.audit_event(event) } }
      end

      private

      def limit
        value = params[:limit].presence || 50
        value.to_i.clamp(1, 100)
      end
    end
  end
end
