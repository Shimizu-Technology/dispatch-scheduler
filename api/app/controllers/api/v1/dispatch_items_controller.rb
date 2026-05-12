module Api
  module V1
    class DispatchItemsController < ApplicationController
      before_action :require_dispatch_edit!

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
        target_order = attrs.delete(:order_index)

        ActiveRecord::Base.transaction do
          item.assign_attributes(attrs)
          team_changed = item.team_id != old_team_id
          order_changed = target_order.present?
          item.save!

          if team_changed
            normalize_orders(item.dispatch_schedule, old_team_id)
          end
          if order_changed
            reorder_team(item.dispatch_schedule, item.team_id, item, target_order)
          elsif team_changed
            normalize_orders(item.dispatch_schedule, item.team_id)
          end
        end
      end

      def normalize_orders(schedule, team_id)
        reorder_team(schedule, team_id)
      end

      def reorder_team(schedule, team_id, pinned_item = nil, target_order = nil)
        return if team_id.blank?

        ordered_ids = schedule.dispatch_items
          .where(team_id: team_id)
          .order(:order_index, :id)
          .pluck(:id, :order_index)
        current_orders = ordered_ids.to_h
        ids = ordered_ids.map(&:first)
        if pinned_item
          ids.delete(pinned_item.id)
          insert_at = target_order.to_i.clamp(0, ids.length)
          ids.insert(insert_at, pinned_item.id)
        end

        changes = ids
          .each_with_index
          .filter_map { |id, index| [ id, index ] if current_orders[id] != index }
        return if changes.empty?

        timestamp = Time.current
        table = DispatchItem.arel_table
        order_case = Arel::Nodes::Case.new(table[:id])
        changes.each do |id, index|
          order_case.when(id).then(index)
        end
        DispatchItem.where(id: changes.map(&:first)).update_all(order_index: order_case, updated_at: timestamp)
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
