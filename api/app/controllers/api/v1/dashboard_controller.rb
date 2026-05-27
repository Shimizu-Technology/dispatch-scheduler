module Api
  module V1
    class DashboardController < ApplicationController
      def index
        date = date_param
        teams = Team.includes(:technicians)
        open_work_orders = WorkOrder.active_queue.open
        render json: {
          date: date,
          counts: {
            open_work_orders: open_work_orders.count,
            needs_assessment: WorkOrder.active_queue.where(status: "needs_assessment").count,
            approved: WorkOrder.active_queue.where(status: "approved").count,
            waiting_for_parts: WorkOrder.active_queue.where(status: "waiting_for_parts").count,
            pa_projects: WorkOrder.active_queue.open.where(pa_project: true).count,
            corrective_maintenance: WorkOrder.active_queue.open.where(corrective_maintenance: true).count,
            estimate_required: WorkOrder.active_queue.open.where(estimate_required: true).count,
            sla_overdue: open_work_orders.sla_overdue_at.count,
            sla_due_soon: open_work_orders.sla_due_soon_at.count,
            sla_missing: open_work_orders.sla_missing.count,
            pm_due: PmTask.dispatchable_for_date(date).count,
            pm_incomplete_month: PmTask.for_month(date).incomplete.count,
            pm_completed_month: PmTask.for_month(date).where(status: "completed").count,
            available_teams: teams.count,
            driver_warnings: teams.reject { |t| t.has_driver?(date) }.count
          },
          status_breakdown: WorkOrder.active_queue.group(:status).count,
          priority_breakdown: WorkOrder.active_queue.group(:normalized_priority).count
        }
      end
    end
  end
end
