require "csv"
require "set"

class MonthlyReportService
  def initialize(month:)
    @month = parse_month(month)
    @start_time = @month.beginning_of_month.beginning_of_day
    @end_time = @month.next_month.beginning_of_month.beginning_of_day
    @as_of_time = report_cutoff
    @data_end_time = [ @end_time, @as_of_time + 1.second ].min
  end

  def payload
    {
      month: month_key,
      generated_at: Time.current.iso8601,
      as_of: @as_of_time.iso8601,
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
    statuses = statuses_as_of(active_during_month)
    CSV.generate(headers: true) do |csv|
      csv << [
        "WO #", "Client", "Location", "Service Line", "Priority", "Status As Of", "KPI Due",
        "Reported At", "Closed At", "Scheduled Date", "Trade", "CM", "Estimate Required", "Estimate #",
        "PA Project", "Parts Status", "Parts Ordered", "Parts Ordered At", "Parts ETA",
        "Follow-up Due", "Follow-up Owner", "Vendor Ref", "Latest Follow-up Note", "Title"
      ]

      active_during_month.each do |work_order|
        csv << [
          work_order.external_id,
          work_order.client.name,
          work_order.location.name,
          work_order.service_line&.name,
          work_order.normalized_priority,
          statuses.fetch(work_order.id, work_order.status),
          sla_due_at_as_of(work_order, statuses.fetch(work_order.id, work_order.status))&.iso8601,
          work_order.reported_at&.iso8601,
          work_order.closed_at&.iso8601,
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

  def report_cutoff
    return @end_time - 1.second if @month < Date.current.beginning_of_month

    Time.current
  end

  def effective_reported_node
    @effective_reported_node ||= Arel::Nodes::NamedFunction.new(
      "COALESCE",
      [ WorkOrder.arel_table[:reported_at], WorkOrder.arel_table[:created_at] ]
    )
  end

  def reported_work_orders
    @reported_work_orders ||= WorkOrder
      .includes(:client, :location, :service_line)
      .where(effective_reported_node.gteq(@start_time))
      .where(effective_reported_node.lt(@data_end_time))
  end

  def active_during_month
    @active_during_month ||= begin
      records = WorkOrder
        .includes(:client, :location, :service_line)
        .where(effective_reported_node.lt(@data_end_time))
        .to_a
      statuses_at_start = statuses_as_of(records, @start_time - 1.second)
      opened_during_month = WorkOrderStatusEvent
        .where(work_order_id: records.map(&:id), occurred_at: @start_time...@data_end_time)
        .where.not(to_status: WorkOrder::CLOSED_STATUSES)
        .distinct
        .pluck(:work_order_id)
        .to_set

      records.select do |work_order|
        effective_reported_at(work_order) >= @start_time ||
          WorkOrder::CLOSED_STATUSES.exclude?(statuses_at_start.fetch(work_order.id, work_order.status)) ||
          opened_during_month.include?(work_order.id)
      end
    end
  end

  def work_orders_as_of
    @work_orders_as_of ||= WorkOrder
      .includes(:client, :location, :service_line)
      .where(effective_reported_node.lteq(@as_of_time))
      .to_a
  end

  def active_as_of
    @active_as_of ||= begin
      statuses = statuses_as_of(work_orders_as_of)
      work_orders_as_of.reject do |work_order|
        WorkOrder::CLOSED_STATUSES.include?(statuses.fetch(work_order.id, work_order.status))
      end
    end
  end

  def closed_during_month_count
    @closed_during_month_count ||= begin
      event_ids = WorkOrderStatusEvent
        .where(to_status: WorkOrder::CLOSED_STATUSES, occurred_at: @start_time...@data_end_time)
        .distinct
        .pluck(:work_order_id)
      timestamp_ids = WorkOrder.where(closed_at: @start_time...@data_end_time).pluck(:id)
      (event_ids | timestamp_ids).length
    end
  end

  def statuses_as_of(work_orders, cutoff = @as_of_time)
    work_orders = work_orders.to_a
    work_order_ids = work_orders.map(&:id)
    return {} if work_order_ids.empty?

    latest_events = WorkOrderStatusEvent
      .where(work_order_id: work_order_ids, occurred_at: ..cutoff)
      .order(:occurred_at, :id)
      .each_with_object({}) { |event, statuses| statuses[event.work_order_id] = event.to_status }
    next_known_events = WorkOrderStatusEvent
      .where(work_order_id: work_order_ids)
      .where("occurred_at > ?", cutoff)
      .where.not(from_status: nil)
      .order(:occurred_at, :id)
      .each_with_object({}) { |event, statuses| statuses[event.work_order_id] ||= event.from_status }

    work_orders.each_with_object(latest_events) do |work_order, statuses|
      statuses[work_order.id] ||= next_known_events[work_order.id]
      statuses[work_order.id] ||= work_order.status if work_order.closed_at.present? && work_order.closed_at <= cutoff
      statuses[work_order.id] ||= "new" if work_order.closed_at.present? && work_order.closed_at > cutoff
      statuses[work_order.id] ||= work_order.status
    end
  end

  def effective_reported_at(work_order)
    work_order.reported_at || work_order.created_at
  end

  def sla_due_at_as_of(work_order, status)
    assessment_pending = WorkOrder::ASSESSMENT_STATUSES.include?(status) && (work_order.assessed_at.blank? || work_order.assessed_at > @as_of_time)
    if assessment_pending
      work_order.assessment_due_at || work_order.response_due_at || work_order.repair_due_at
    else
      work_order.repair_due_at || work_order.assessment_due_at || work_order.response_due_at
    end
  end

  def work_order_summary
    active_records = active_as_of
    active_statuses = statuses_as_of(active_records)
    status_counts = active_records.each_with_object(Hash.new(0)) do |work_order, counts|
      counts[active_statuses.fetch(work_order.id, work_order.status)] += 1
    end
    kpi_records = active_records.reject(&:pa_project?)
    kpi_due_dates = kpi_records.to_h { |work_order| [ work_order.id, sla_due_at_as_of(work_order, active_statuses.fetch(work_order.id, work_order.status)) ] }
    due_soon_end = @as_of_time + 24.hours

    {
      total: reported_work_orders.count,
      reported: reported_work_orders.count,
      active_during_month: active_during_month.length,
      open: active_records.count,
      open_as_of: active_records.count,
      completed_or_closed: closed_during_month_count,
      closed_during_month: closed_during_month_count,
      corrective_maintenance: reported_work_orders.where(corrective_maintenance: true).count,
      estimate_required: reported_work_orders.where(estimate_required: true).count,
      pa_projects: active_records.count(&:pa_project?),
      waiting_for_parts: status_counts.fetch("waiting_for_parts", 0),
      waiting_for_approval: status_counts.fetch("waiting_for_approval", 0),
      kpi_overdue: kpi_due_dates.count { |_id, due_at| due_at.present? && due_at < @as_of_time },
      kpi_due_soon: kpi_due_dates.count { |_id, due_at| due_at.present? && due_at >= @as_of_time && due_at <= due_soon_end },
      kpi_missing: kpi_due_dates.count { |_id, due_at| due_at.blank? },
      by_status: status_counts,
      by_priority: reported_work_orders.group(:normalized_priority).count,
      by_service_line: reported_work_orders.left_joins(:service_line).group("service_lines.name").count.transform_keys { |key| key.presence || "Unassigned" }
    }
  end

  def pm_tasks
    @pm_tasks ||= PmTask
      .includes(:client, :location)
      .for_month(@month)
      .where("pm_tasks.archived_at IS NULL OR pm_tasks.archived_at > ?", @as_of_time)
  end

  def pm_summary
    tasks = pm_tasks.to_a
    statuses = pm_statuses_as_of(tasks)
    status_counts = tasks.each_with_object(Hash.new(0)) { |pm_task, counts| counts[statuses.fetch(pm_task.id, pm_task.status)] += 1 }
    completed_tasks = tasks.select { |pm_task| statuses.fetch(pm_task.id, pm_task.status) == "completed" }
    timed_tasks = completed_tasks.select { |pm_task| pm_task.actual_duration_minutes.present? }
    timed_visits = timed_pm_visits(timed_tasks)
    {
      total: tasks.count,
      completed: completed_tasks.count,
      incomplete: tasks.count - completed_tasks.count,
      deferred: status_counts.fetch("deferred", 0),
      timed: timed_tasks.count,
      timed_visits: timed_visits.count,
      actual_minutes: timed_visits.sum { |visit| visit.fetch(:minutes) },
      by_status: status_counts,
      by_region: pm_tasks.joins(:location).group("locations.region").count,
      by_trade_actual_minutes: timed_pm_minutes_by_trade(timed_visits)
    }
  end

  def pm_statuses_as_of(tasks)
    task_ids = tasks.map(&:id)
    return {} if task_ids.empty?

    latest_events = PmTaskStatusEvent
      .where(pm_task_id: task_ids, occurred_at: ..@as_of_time)
      .order(:occurred_at, :id)
      .each_with_object({}) { |event, statuses| statuses[event.pm_task_id] = event.to_status }
    next_known_events = PmTaskStatusEvent
      .where(pm_task_id: task_ids)
      .where("occurred_at > ?", @as_of_time)
      .where.not(from_status: nil)
      .order(:occurred_at, :id)
      .each_with_object({}) { |event, statuses| statuses[event.pm_task_id] ||= event.from_status }

    tasks.each_with_object(latest_events) do |pm_task, statuses|
      statuses[pm_task.id] ||= "completed" if pm_task.completed_at.present? && pm_task.completed_at <= @as_of_time
      statuses[pm_task.id] ||= next_known_events[pm_task.id]
      statuses[pm_task.id] ||= "pending" if pm_task.completed_at.present? && pm_task.completed_at > @as_of_time
      statuses[pm_task.id] ||= pm_task.status
    end
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
    active_scope = WorkOrder.where(id: active_during_month.map(&:id)).where.not(follow_up_due_on: nil)
    open_at_cutoff_scope = WorkOrder.where(id: active_as_of.map(&:id)).where.not(follow_up_due_on: nil)
    as_of_date = @as_of_time.to_date
    {
      due_today: open_at_cutoff_scope.where(follow_up_due_on: ..as_of_date).count,
      due_by_as_of: open_at_cutoff_scope.where(follow_up_due_on: ..as_of_date).count,
      due_this_month: active_scope.where(follow_up_due_on: @month.beginning_of_month..@month.end_of_month).count,
      parts_eta_this_month: WorkOrder.where(id: active_during_month.map(&:id), parts_eta: @month.beginning_of_month..@month.end_of_month).count,
      pa_projects_due_this_month: active_scope.where(pa_project: true, follow_up_due_on: @month.beginning_of_month..@month.end_of_month).count
    }
  end
end
