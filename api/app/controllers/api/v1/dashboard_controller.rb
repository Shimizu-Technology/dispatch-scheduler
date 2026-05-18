module Api
  module V1
    class DashboardController < ApplicationController
      def index
        date = date_param
        teams = Team.includes(:technicians)
        render json: {
          date: date,
          counts: {
            open_work_orders: WorkOrder.open.count,
            needs_assessment: WorkOrder.where(status: "needs_assessment").count,
            approved: WorkOrder.where(status: "approved").count,
            waiting_for_parts: WorkOrder.where(status: "waiting_for_parts").count,
            pm_due: PmTask.where(scheduled_date: date).count,
            available_teams: teams.count,
            driver_warnings: teams.reject { |t| t.has_driver?(date) }.count
          },
          status_breakdown: WorkOrder.group(:status).count,
          priority_breakdown: WorkOrder.group(:normalized_priority).count
        }
      end
    end
  end
end
