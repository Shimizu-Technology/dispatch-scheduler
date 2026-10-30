module Api
  module V1
    class WorkOrderImportsController < ApplicationController
      before_action :require_dispatch_edit!

      def preview
        result = WorkOrderOcrExtractor.extract(params[:file], text: params[:text])
        if result[:success]
          payload = { work_orders: result[:work_orders] }
          payload[:warnings] = result[:warnings] if result[:warnings].present?
          render json: payload
        else
          render json: { errors: [ result[:error] ] }, status: :unprocessable_entity
        end
      end
    end
  end
end
