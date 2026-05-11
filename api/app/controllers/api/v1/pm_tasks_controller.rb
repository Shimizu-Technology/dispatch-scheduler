module Api
  module V1
    class PmTasksController < ApplicationController
      def index
        scope = PmTask.includes(:client, :location).order(:scheduled_date, :id)
        scope = scope.where(scheduled_date: params[:date]) if params[:date].present?
        render json: scope.limit(200).map { |pm| Serializers.pm_task(pm) }
      end
    end
  end
end
