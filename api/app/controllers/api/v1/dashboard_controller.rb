module Api
  module V1
    class DashboardController < ApplicationController
      def index
        date = date_param
        teams = Team.active.includes(:technicians)
        open_work_orders = WorkOrder.active_queue.open
        kpi_work_orders = open_work_orders.where(pa_project: [ false, nil ])
        render json: {
          date: date,
          counts: {
            open_work_orders: open_work_orders.count,
            high_priority_open_work_orders: open_work_orders.where(normalized_priority: [ "P1", "P2" ]).count,
            needs_assessment: WorkOrder.active_queue.where(status: "needs_assessment").count,
            approved: WorkOrder.active_queue.where(status: "approved").count,
            unscheduled_approved: WorkOrder.active_queue.where(status: "approved", scheduled_date: nil).count,
            waiting_for_parts: WorkOrder.active_queue.where(status: "waiting_for_parts").count,
            pa_projects: WorkOrder.active_queue.open.where(pa_project: true).count,
            corrective_maintenance: WorkOrder.active_queue.open.where(corrective_maintenance: true).count,
            estimate_required: WorkOrder.active_queue.open.where(estimate_required: true).count,
            sla_overdue: kpi_work_orders.sla_overdue_at.count,
            sla_due_soon: kpi_work_orders.sla_due_soon_at.count,
            sla_missing: kpi_work_orders.sla_missing.count,
            pm_due: PmTask.dispatchable_for_date(date).count,
            pm_incomplete_month: PmTask.for_month(date).incomplete.count,
            pm_completed_month: PmTask.for_month(date).where(status: "completed").count,
            unfinished_previous_items: unfinished_previous_work_orders(date).count,
            available_teams: teams.count,
            driver_warnings: teams.reject { |t| t.has_driver?(date) }.count
          },
          status_breakdown: WorkOrder.active_queue.group(:status).count,
          priority_breakdown: WorkOrder.active_queue.group(:normalized_priority).count
        }
      end

      private

      def unfinished_previous_work_orders(date)
        WorkOrder.dispatchable
          .where(pa_project: [ false, nil ])
          .where(status: DispatchSuggestionService::UNFINISHED_WORK_ORDER_STATUSES)
          .joins(dispatch_items: :dispatch_schedule)
          .where(dispatch_items: { outcome_status: "pending" })
          .where(dispatch_schedules: { status: %w[finalized sent] })
          .where("dispatch_schedules.date < ?", date)
          .where("work_orders.scheduled_date IS NULL OR work_orders.scheduled_date < ?", date)
          .distinct
      end
    end
  end
end
