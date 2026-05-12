module Serializers
  module_function

  def schedule(dispatch_schedule, summary: nil)
    schedule = DispatchSchedule.includes(dispatch_items: [ :team, { work_order: [ :client, :location ] }, { pm_task: [ :client, :location ] } ]).find(dispatch_schedule.id)
    {
      id: schedule.id,
      date: schedule.date,
      status: schedule.status,
      summary: summary || schedule_summary(schedule),
      items: schedule.dispatch_items.map { |item| dispatch_item(item) }
    }
  end

  def schedule_summary(schedule)
    candidate_work_orders = eligible_work_orders_for(schedule.date)
    candidate_pm_tasks = pm_tasks_due_for(schedule.date)
    eligible_work_order_count = candidate_work_orders.count
    eligible_pm_task_count = candidate_pm_tasks.count
    candidate_count = eligible_work_order_count + eligible_pm_task_count
    scheduled_capacity = [ candidate_count, daily_item_limit ].min
    deferred = [ candidate_count - scheduled_capacity, 0 ].max
    blocked = blocked_work_orders_for(schedule.date).count
    {
      scheduled_items: schedule.dispatch_items.size,
      eligible_work_orders: eligible_work_order_count,
      eligible_pm_tasks: eligible_pm_task_count,
      deferred_items: deferred,
      daily_item_limit: daily_item_limit,
      blocked_work_orders: blocked,
      message: schedule_summary_message(blocked, deferred)
    }
  end

  def eligible_work_orders_for(date)
    WorkOrder.open
      .where("scheduled_date = ? OR scheduled_date IS NULL", date)
      .where.not(status: %w[waiting_for_parts waiting_for_approval])
  end

  def pm_tasks_due_for(date)
    PmTask.where(scheduled_date: date)
  end

  def blocked_work_orders_for(date)
    WorkOrder.open
      .where(status: %w[waiting_for_parts waiting_for_approval])
      .where("scheduled_date = ? OR scheduled_date IS NULL", date)
  end

  def daily_item_limit
    ENV.fetch("DISPATCH_DAILY_ITEM_LIMIT", DispatchSuggestionService::DEFAULT_DAILY_ITEM_LIMIT).to_i
  end

  def schedule_summary_message(blocked, deferred)
    notes = []
    notes << "#{deferred} eligible item(s) deferred by the daily draft limit." if deferred.positive?
    notes << "#{blocked} waiting-for-parts/approval item(s) were held out of dispatch." if blocked.positive?
    notes.presence&.join(" ") || "No eligible or blocked items were held out."
  end

  def work_order(work_order)
    {
      id: work_order.id,
      external_id: work_order.external_id,
      client: work_order.client.name,
      location: work_order.location.name,
      region: work_order.location.region,
      title: work_order.title,
      description: work_order.description,
      priority: work_order.priority,
      normalized_priority: work_order.normalized_priority,
      status: work_order.status,
      original_status_text: work_order.original_status_text,
      trade_category: work_order.trade_category,
      scheduled_date: work_order.scheduled_date,
      source: work_order.source,
      team_id: work_order.team_id,
      team_name: work_order.team&.name,
      notes: work_order.notes
    }
  end

  def technician(technician, date: Date.current)
    availability = technician.technician_availabilities.find_by(date: date)
    {
      id: technician.id,
      name: technician.name,
      primary_trade: technician.primary_trade,
      skills: technician.technician_skills.pluck(:skill),
      is_driver: technician.is_driver,
      active: technician.active,
      availability: availability&.status || "available",
      availability_reason: availability&.reason
    }
  end

  def team(team, date: Date.current)
    techs = team.technicians.includes(:technician_skills, :technician_availabilities)
    {
      id: team.id,
      name: team.name,
      region_preference: team.region_preference,
      has_driver: team.has_driver?(date),
      skills: team.skills,
      technicians: techs.map { |tech| technician(tech, date: date) }
    }
  end

  def pm_task(pm_task)
    {
      id: pm_task.id,
      client: pm_task.client.name,
      location: pm_task.location.name,
      region: pm_task.location.region,
      task_name: pm_task.task_name,
      trade_category: pm_task.trade_category,
      frequency: pm_task.frequency,
      scheduled_date: pm_task.scheduled_date,
      source_file: pm_task.source_file
    }
  end

  def dispatch_item(item)
    schedulable = item.schedulable
    base = {
      id: item.id,
      team_id: item.team_id,
      team_name: item.team.name,
      order_index: item.order_index,
      scheduled_time: item.scheduled_time&.strftime("%H:%M"),
      notes: item.notes,
      kind: item.work_order_id ? "work_order" : "pm_task"
    }

    if item.work_order_id
      base.merge(work_order: work_order(schedulable))
    else
      base.merge(pm_task: pm_task(schedulable))
    end
  end
end
