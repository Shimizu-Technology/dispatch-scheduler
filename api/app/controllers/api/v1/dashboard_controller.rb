module Api
  module V1
    class DashboardController < ApplicationController
      def index
        date = date_param
        teams = Team.includes(:technicians)
        render json: {
          date: date,
          counts: {
            open_work_orders: WorkOrder.active_queue.open.count,
            needs_assessment: WorkOrder.active_queue.where(status: "needs_assessment").count,
            approved: WorkOrder.active_queue.where(status: "approved").count,
            waiting_for_parts: WorkOrder.active_queue.where(status: "waiting_for_parts").count,
            pa_projects: WorkOrder.active_queue.open.where(pa_project: true).count,
            corrective_maintenance: WorkOrder.active_queue.open.where(corrective_maintenance: true).count,
            estimate_required: WorkOrder.active_queue.open.where(estimate_required: true).count,
            pm_due: PmTask.where(scheduled_date: date).count,
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
