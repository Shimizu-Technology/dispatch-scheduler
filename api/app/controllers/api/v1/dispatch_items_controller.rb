module Api
  module V1
    class DispatchItemsController < ApplicationController
      def update
        item = DispatchItem.includes(:dispatch_schedule).find(params[:id])
        update_item(item, dispatch_item_params)
        render json: Serializers.schedule(item.dispatch_schedule)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ActiveRecord::InvalidForeignKey => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
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

        changes = schedule.dispatch_items
          .where(team_id: team_id)
          .order(:order_index, :id)
          .pluck(:id, :order_index)
          .each_with_index
          .filter_map { |(id, order_index), index| [ id, index ] if order_index != index }
        return if changes.empty?

        ids = changes.map(&:first)
        cases = changes.map { |id, index| "WHEN #{id.to_i} THEN #{index.to_i}" }.join(" ")
        DispatchItem.where(id: ids).update_all("order_index = CASE id #{cases} END")
      end

      def dispatch_item_params
        permitted = params.permit(:team_id, :order_index, :scheduled_time, :notes)
        if params.key?(:scheduled_time)
          permitted[:scheduled_time] = permitted[:scheduled_time].present? ? normalize_time(permitted[:scheduled_time]) : nil
        end
        permitted
      end

      def normalize_time(value)
        Time.zone.parse(value.to_s)&.strftime("%H:%M")
      end
    end
  end
end
