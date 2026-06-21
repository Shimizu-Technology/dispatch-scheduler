require "csv"

class MonthlyReportService
  def initialize(month:)
    @month = parse_month(month)
    @start_time = @month.beginning_of_month.beginning_of_day
    @end_time = @month.next_month.beginning_of_month.beginning_of_day
  end

  def payload
    {
      month: month_key,
      generated_at: Time.current.iso8601,
      period: {
        starts_on: @month.beginning_of_month.iso8601,
        ends_on: @month.end_of_month.iso8601
      },
      work_orders: work_order_summary,
      pm_tasks: pm_summary,
      follow_ups: follow_up_summary
    }
  end

  def to_csv
    CSV.generate(headers: true) do |csv|
      csv << [
        "WO #", "Client", "Location", "Service Line", "Priority", "Status", "KPI Due",
        "Reported At", "Scheduled Date", "Trade", "CM", "Estimate Required", "Estimate #",
        "PA Project", "Parts Status", "Parts Ordered", "Parts Ordered At", "Parts ETA",
        "Follow-up Due", "Follow-up Owner", "Vendor Ref", "Latest Follow-up Note", "Title"
      ]

      work_orders.find_each do |work_order|
        csv << [
          work_order.external_id,
          work_order.client.name,
          work_order.location.name,
          work_order.service_line&.name,
          work_order.normalized_priority,
          work_order.status,
          work_order.sla_due_at&.iso8601,
          work_order.reported_at&.iso8601,
          work_order.scheduled_date&.iso8601,
          work_order.trade_category,
          work_order.corrective_maintenance?,
          work_order.estimate_required?,
          work_order.estimate_number,
          work_order.pa_project?,
          work_order.parts_status,
          work_order.parts_ordered?,
          work_order.parts_ordered_at&.iso8601,
          work_order.parts_eta&.iso8601,
          work_order.follow_up_due_on&.iso8601,
          work_order.follow_up_owner,
          work_order.vendor_reference,
          work_order.latest_follow_up_note,
          work_order.title
        ]
      end
    end
  end

  private

  def parse_month(value)
    raw = value.to_s.strip
    raw = Date.current.strftime("%Y-%m") if raw.blank?
    Date.parse("#{raw}-01")
  rescue Date::Error
    raise ActionController::BadRequest, "Invalid month"
  end

  def month_key
    @month.strftime("%Y-%m")
  end

  def work_orders
    @work_orders ||= WorkOrder
      .includes(:client, :location, :service_line)
      .where("COALESCE(work_orders.reported_at, work_orders.created_at) >= ? AND COALESCE(work_orders.reported_at, work_orders.created_at) < ?", @start_time, @end_time)
  end

  def open_work_orders
    work_orders.where.not(status: WorkOrder::CLOSED_STATUSES)
  end

  def kpi_work_orders
    open_work_orders.where(pa_project: [ false, nil ])
  end

  def work_order_summary
    {
      total: work_orders.count,
      open: open_work_orders.count,
      completed_or_closed: work_orders.where(status: WorkOrder::CLOSED_STATUSES).count,
      corrective_maintenance: work_orders.where(corrective_maintenance: true).count,
      estimate_required: work_orders.where(estimate_required: true).count,
      pa_projects: work_orders.where(pa_project: true).count,
      waiting_for_parts: work_orders.where(status: "waiting_for_parts").count,
      waiting_for_approval: work_orders.where(status: "waiting_for_approval").count,
      kpi_overdue: kpi_work_orders.select(&:sla_overdue?).count,
      kpi_due_soon: kpi_work_orders.select(&:sla_due_soon?).count,
      kpi_missing: kpi_work_orders.select(&:sla_missing?).count,
      by_status: work_orders.group(:status).count,
      by_priority: work_orders.group(:normalized_priority).count,
      by_service_line: work_orders.left_joins(:service_line).group("service_lines.name").count.transform_keys { |key| key.presence || "Unassigned" }
    }
  end

  def pm_tasks
    @pm_tasks ||= PmTask.active.includes(:client, :location).for_month(@month)
  end

  def pm_summary
    timed_tasks = pm_tasks.select { |pm_task| pm_task.actual_duration_minutes.present? }
    timed_visits = timed_pm_visits(timed_tasks)
    {
      total: pm_tasks.count,
      completed: pm_tasks.where(status: "completed").count,
      incomplete: pm_tasks.where.not(status: "completed").count,
      deferred: pm_tasks.where(status: "deferred").count,
      timed: timed_tasks.count,
      timed_visits: timed_visits.count,
      actual_minutes: timed_visits.sum { |visit| visit.fetch(:minutes) },
      by_status: pm_tasks.group(:status).count,
      by_region: pm_tasks.joins(:location).group("locations.region").count,
      by_trade_actual_minutes: timed_pm_minutes_by_trade(timed_visits)
    }
  end

  def timed_pm_visits(timed_tasks)
    # Station bulk-complete applies one JCF visit window to every checklist item
    # at the station. Count that shared window once so actual PM time does not
    # inflate by the number of tasks completed during the same visit.
    timed_tasks.group_by { |pm_task| [ pm_task.location_id, pm_task.time_in_at.to_i, pm_task.time_out_at.to_i ] }.values.map do |tasks|
      { tasks: tasks, minutes: tasks.first.actual_duration_minutes.to_i }
    end
  end

  def timed_pm_minutes_by_trade(timed_visits)
    timed_visits.each_with_object(Hash.new(0)) do |visit, totals|
      allocate_visit_minutes_by_trade(visit.fetch(:tasks), visit.fetch(:minutes)).each do |trade, minutes|
        totals[trade] += minutes
      end
    end
  end

  def allocate_visit_minutes_by_trade(tasks, minutes)
    weights_by_trade = tasks.each_with_object(Hash.new(0)) do |task, weights|
      estimated_minutes = task.estimated_minutes.to_i
      weights[task.trade_category] += estimated_minutes.positive? ? estimated_minutes : 1
    end
    total_weight = weights_by_trade.values.sum
    return {} if total_weight.zero?

    allocations = weights_by_trade.transform_values { |weight| (minutes * weight) / total_weight }
    remainder = minutes - allocations.values.sum
    weighted_remainders = weights_by_trade.map { |trade, weight| [ trade, (minutes * weight) % total_weight ] }.sort_by { |trade, remainder_weight| [ -remainder_weight, trade ] }
    weighted_remainders.first(remainder).each { |trade, _remainder_weight| allocations[trade] += 1 }
    allocations
  end

  def follow_up_summary
    due_scope = WorkOrder.active_queue.open.where.not(follow_up_due_on: nil)
    {
      due_today: due_scope.where(follow_up_due_on: ..Date.current).count,
      due_this_month: due_scope.where(follow_up_due_on: @month.beginning_of_month..@month.end_of_month).count,
      parts_eta_this_month: WorkOrder.active_queue.open.where(parts_eta: @month.beginning_of_month..@month.end_of_month).count,
      pa_projects_due_this_month: due_scope.where(pa_project: true, follow_up_due_on: @month.beginning_of_month..@month.end_of_month).count
    }
  end
end
