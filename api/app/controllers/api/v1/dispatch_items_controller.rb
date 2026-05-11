module Api
  module V1
    class DispatchItemsController < ApplicationController
      def update
        item = DispatchItem.includes(:dispatch_schedule).find(params[:id])
        update_item(item, dispatch_item_params)
        render json: Serializers.schedule(item.dispatch_schedule)
      end

      private

      def update_item(item, attrs)
        old_team_id = item.team_id
        old_order = item.order_index
        target_order = attrs.delete(:order_index)

        ActiveRecord::Base.transaction do
          item.assign_attributes(attrs)
          item.order_index = target_order if target_order.present?
          item.save!

          if target_order.present? && item.team_id == old_team_id
            swap_order(item, old_order)
          else
            normalize_orders(item.dispatch_schedule, old_team_id)
          end
          normalize_orders(item.dispatch_schedule, item.team_id)
        end
      end

      def swap_order(item, old_order)
        sibling = item.dispatch_schedule.dispatch_items
          .where(team_id: item.team_id, order_index: item.order_index)
          .where.not(id: item.id)
          .first
        sibling&.update!(order_index: old_order)
      end

      def normalize_orders(schedule, team_id)
        return if team_id.blank?

        schedule.dispatch_items.where(team_id: team_id).order(:order_index, :id).each_with_index do |item, index|
          item.update_column(:order_index, index) if item.order_index != index
        end
      end

      def dispatch_item_params
        permitted = params.permit(:team_id, :order_index, :scheduled_time, :notes)
        permitted[:scheduled_time] = normalize_time(permitted[:scheduled_time]) if permitted[:scheduled_time].present?
        permitted
      end

      def normalize_time(value)
        Time.zone.parse(value.to_s)&.strftime("%H:%M")
      end
    end
  end
end
