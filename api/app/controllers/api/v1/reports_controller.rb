module Api
  module V1
    class ReportsController < ApplicationController
      def monthly
        report = MonthlyReportService.new(month: params[:month])

        if request.format.csv? || params[:format] == "csv"
          send_data report.to_csv,
            filename: "jmi-dispatch-report-#{report.payload[:month]}.csv",
            type: "text/csv; charset=utf-8"
        else
          render json: report.payload
        end
      end
    end
  end
end
