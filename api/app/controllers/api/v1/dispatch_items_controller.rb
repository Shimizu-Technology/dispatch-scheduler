module Api
  module V1
    class DispatchItemsController < ApplicationController
      before_action :require_dispatch_edit!

      def update
        item = DispatchItem.includes(:dispatch_schedule, :team).find(params[:id])
        if item.dispatch_schedule.locked?
          return render json: { errors: [ "This schedule is #{item.dispatch_schedule.status}. Reopen it before editing dispatch items." ] }, status: :conflict
        end

        previous_team = item.team
        ApplicationRecord.transaction do
          update_item(item, dispatch_item_params)
          action = item.team_id == previous_team.id ? "dispatch_item.updated" : "dispatch_item.reassigned"
          AuditEvent.record!(action: action, record: item, user: current_user, metadata: dispatch_item_audit_metadata(item).merge(previous_team: previous_team.name, new_team: item.team.name, reassignment_reason: item.reassignment_reason))
        end
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

      def outcome
        item = DispatchItem.includes(:dispatch_schedule, :work_order, :pm_task, :team).find(params[:id])
        update_outcome(item, outcome_params)
        render json: Serializers.schedule(item.dispatch_schedule)
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      private

      def dispatch_item_audit_metadata(item)
        schedulable = item.schedulable
        {
          schedule_date: item.dispatch_schedule.date,
          team: item.team.name,
          order_index: item.order_index,
          scheduled_time: item.scheduled_time&.strftime("%H:%M"),
          notes: item.notes,
          item: item.work_order_id ? schedulable&.title : schedulable&.task_name,
          kind: item.work_order_id ? "work_order" : "pm_task"
        }
      end

      def update_item(item, attrs)
        old_team_id = item.team_id
        target_order = attrs.delete(:order_index)

        ApplicationRecord.transaction do
          item.assign_attributes(attrs)
          team_changed = item.team_id != old_team_id
          order_changed = target_order.present?
          item.reassignment_reason = nil unless team_changed
          item.save!
          item.snapshot_technicians! if team_changed

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

      def update_outcome(item, attrs)
        status = attrs[:outcome_status].presence || "pending"
        raise ArgumentError, "Invalid outcome status" unless DispatchItem::OUTCOME_STATUSES.include?(status)

        ApplicationRecord.transaction do
          item.update!(
            outcome_status: status,
            outcome_notes: attrs[:outcome_notes],
            carried_over_to_date: status == "carry_over" ? carry_over_date(attrs[:carried_over_to_date], item.dispatch_schedule.date) : nil,
            completed_at: status == "completed" ? Time.current : nil
          )
          update_work_order_from_outcome(item) if item.work_order
          update_pm_task_from_outcome(item) if item.pm_task
          AuditEvent.record!(action: "dispatch_item.outcome_updated", record: item, user: current_user, metadata: dispatch_item_audit_metadata(item).merge(outcome_status: item.outcome_status, outcome_notes: item.outcome_notes, carried_over_to_date: item.carried_over_to_date))
        end
      end

      def update_pm_task_from_outcome(item)
        attrs = case item.outcome_status
        when "completed" then { status: "completed", completed_at: Time.current, deferred_until: nil }
        when "carry_over" then { status: "deferred", completed_at: nil, deferred_until: item.carried_over_to_date }
        when "cancelled" then { status: "deferred", completed_at: nil, deferred_until: item.dispatch_schedule.date.next_month.beginning_of_month }
        when "pending" then { status: "scheduled", completed_at: nil, deferred_until: nil }
        else
          # Waiting-parts/approval/access outcomes do not alter PM lifecycle state.
          return
        end
        item.pm_task.update!(attrs)
      end

      def update_work_order_from_outcome(item)
        status = case item.outcome_status
        when "completed" then "completed"
        when "carry_over" then "carry_over"
        when "waiting_parts" then "waiting_for_parts"
        when "waiting_approval" then "waiting_for_approval"
        when "unable_to_access" then "needs_assessment"
        when "cancelled" then "cancelled"
        when "pending" then "scheduled"
        else item.work_order.status
        end
        item.work_order.update!(status: status, scheduled_date: item.carry_over? ? item.carried_over_to_date : item.dispatch_schedule.date)
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
        permitted = params.permit(:team_id, :order_index, :scheduled_time, :notes, :reassignment_reason)
        if params.key?(:scheduled_time)
          permitted[:scheduled_time] = permitted[:scheduled_time].present? ? normalize_time(permitted[:scheduled_time]) : nil
        end
        permitted
      end

      def outcome_params
        params.permit(:outcome_status, :outcome_notes, :carried_over_to_date)
      end

      def carry_over_date(value, schedule_date)
        value.present? ? Date.parse(value.to_s) : schedule_date.next_day
      end

      def normalize_time(value)
        Time.zone.parse(value.to_s)&.strftime("%H:%M")
      end
    end
  end
end
