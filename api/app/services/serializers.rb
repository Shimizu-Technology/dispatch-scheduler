module Serializers
  module_function

  def schedule(dispatch_schedule, summary: nil)
    schedule = DispatchSchedule.includes(dispatch_items: [ :team, { work_order: [ :client, :location ] }, { pm_task: [ :client, :location ] } ]).find(dispatch_schedule.id)
    {
      id: schedule.id,
      date: schedule.date,
      status: schedule.status,
      finalized_at: schedule.finalized_at&.iso8601,
      sent_at: schedule.sent_at&.iso8601,
      finalized_by: schedule.finalized_by_user&.display_name,
      sent_by: schedule.sent_by_user&.display_name,
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
    deferred = [ candidate_count - schedule.dispatch_items.size, 0 ].max
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

  def user(user)
    {
      id: user.id,
      clerk_id: user.clerk_id,
      email: user.email,
      name: user.display_name,
      role: user.role,
      auth_mode: user.auth_mode,
      last_seen_at: user.respond_to?(:last_seen_at) ? user.last_seen_at&.iso8601 : nil,
      permissions: {
        can_edit_dispatch: user.can_edit_dispatch?,
        can_admin: user.admin?
      }
    }
  end

  def technician(technician, date: Date.current)
    availability = availability_for(technician, date)
    {
      id: technician.id,
      name: technician.name,
      primary_trade: technician.primary_trade,
      skills: skills_for(technician),
      is_driver: technician.is_driver,
      active: technician.active,
      availability: availability&.status || "available",
      availability_reason: availability&.reason
    }
  end

  def team(team, date: Date.current, daily_memberships: nil, default_memberships: nil, daily_override: nil)
    daily_override = daily_override.nil? ? (daily_memberships.nil? ? team.daily_override?(date) : daily_memberships.any?) : daily_override
    techs = if daily_memberships && default_memberships
      memberships = daily_override ? daily_memberships : default_memberships
      memberships.map(&:technician)
    else
      team.technicians_for_date(date).includes(:technician_skills, :technician_availabilities).to_a
    end
    available_techs = techs.select { |tech| available_for_date?(tech, date) }
    default_techs = if default_memberships
      default_memberships.map(&:technician)
    else
      team.team_memberships.where(date: nil).includes(technician: [ :technician_skills, :technician_availabilities ]).map(&:technician)
    end
    today_crew_name = techs.map(&:name).join(" / ")
    available_default_techs = default_techs.select { |tech| available_for_date?(tech, date) }

    {
      id: team.id,
      name: team.name,
      today_crew_name: today_crew_name.presence || "No technicians assigned today",
      region_preference: team.region_preference,
      has_driver: available_techs.any? { |tech| tech.is_driver && tech.active },
      default_has_driver: available_default_techs.any? { |tech| tech.is_driver && tech.active },
      skills: available_techs.flat_map { |tech| skills_for(tech) }.uniq,
      default_skills: available_default_techs.flat_map { |tech| skills_for(tech) }.uniq,
      daily_override: daily_override,
      technicians: techs.map { |tech| technician(tech, date: date) },
      default_technicians: default_techs.map { |tech| technician(tech, date: date) }
    }
  end

  def availability_for(technician, date)
    if technician.association(:technician_availabilities).loaded?
      technician.technician_availabilities.find { |availability| availability.date == date }
    else
      technician.technician_availabilities.find_by(date: date)
    end
  end

  def available_for_date?(technician, date)
    technician.active && availability_for(technician, date)&.status != "unavailable"
  end

  def skills_for(technician)
    if technician.association(:technician_skills).loaded?
      technician.technician_skills.map(&:skill)
    else
      technician.technician_skills.pluck(:skill)
    end
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

  def audit_event(event)
    {
      id: event.id,
      action: event.action,
      record_type: event.record_type,
      record_id: event.record_id,
      user_name: event.user&.display_name,
      occurred_at: event.occurred_at&.iso8601,
      metadata: event.metadata_hash
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
