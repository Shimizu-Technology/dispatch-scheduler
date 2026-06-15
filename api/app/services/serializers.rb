module Serializers
  module_function

  def schedule(dispatch_schedule, summary: nil)
    schedule = DispatchSchedule.includes(dispatch_items: [ :team, :dispatch_item_technicians, { work_order: [ :client, :location, :service_line ] }, { pm_task: [ :client, :location ] } ]).find(dispatch_schedule.id)
    team_contexts = dispatch_team_contexts(schedule)
    {
      id: schedule.id,
      date: schedule.date,
      status: schedule.status,
      finalized_at: schedule.finalized_at&.iso8601,
      sent_at: schedule.sent_at&.iso8601,
      finalized_by: schedule.finalized_by_user&.display_name,
      sent_by: schedule.sent_by_user&.display_name,
      summary: summary || schedule_summary(schedule),
      items: schedule.dispatch_items.map { |item| dispatch_item(item, team_context: team_contexts.fetch(item.team_id)) }
    }
  end

  def schedule_summary(schedule)
    candidate_work_orders = eligible_work_orders_for(schedule.date)
    candidate_pm_tasks = pm_tasks_due_for(schedule.date, work_order_location_scope: candidate_work_orders.select(:location_id).distinct)
    eligible_work_order_count = candidate_work_orders.count
    eligible_pm_task_count = candidate_pm_tasks.count
    scheduled_items = schedule.dispatch_items.size
    candidate_count = eligible_work_order_count + eligible_pm_task_count
    deferred = [ candidate_count - scheduled_items, 0 ].max
    blocked = blocked_work_orders_for(schedule.date).count
    unfinished = unfinished_previous_work_orders_for(schedule.date).count
    capacity_deferred = schedule.capacity_deferred_items_count
    over_capacity = over_capacity_items_for(schedule)
    {
      scheduled_items: scheduled_items,
      eligible_work_orders: eligible_work_order_count,
      eligible_pm_tasks: eligible_pm_task_count,
      deferred_items: deferred,
      daily_item_limit: daily_item_limit,
      blocked_work_orders: blocked,
      unfinished_previous_items: unfinished,
      capacity_deferred_items: capacity_deferred,
      over_capacity_items: over_capacity,
      message: schedule_summary_message(blocked, deferred, unfinished, capacity_deferred, over_capacity)
    }
  end

  def eligible_work_orders_for(date)
    scheduled_scope = WorkOrder.dispatchable.sla_dispatchable_for_date(date)
    carry_over_scope = WorkOrder.dispatchable.joins(:dispatch_items).where(dispatch_items: { outcome_status: "carry_over", carried_over_to_date: date })
    unfinished_scope = unfinished_previous_work_orders_for(date)
    WorkOrder.where(id: scheduled_scope.select(:id))
      .or(WorkOrder.where(id: carry_over_scope.select(:id)))
      .or(WorkOrder.where(id: unfinished_scope.select(:id)))
  end

  def pm_tasks_due_for(date, work_order_location_scope: nil)
    explicit_due = PmTask.dispatchable_for_date(date)
    return explicit_due unless work_order_location_scope

    PmTask.where(id: explicit_due.select(:id)).or(PmTask.opportunistic_for_locations(date, work_order_location_scope))
  end

  def over_capacity_items_for(schedule)
    if schedule.association(:dispatch_items).loaded?
      schedule.dispatch_items.count(&:capacity_overflow?)
    else
      schedule.dispatch_items.where(capacity_overflow: true).count
    end
  end

  def unfinished_previous_work_orders_for(date)
    WorkOrder.unfinished_previous_dispatch_for(date)
  end

  def blocked_work_orders_for(date)
    WorkOrder.active_queue.open
      .where(status: WorkOrder::BLOCKED_STATUSES)
      .where("scheduled_date = ? OR scheduled_date IS NULL", date)
  end

  def daily_item_limit
    ENV.fetch("DISPATCH_DAILY_ITEM_LIMIT", DispatchSuggestionService::DEFAULT_DAILY_ITEM_LIMIT).to_i
  end

  def schedule_summary_message(blocked, deferred, unfinished = 0, capacity_deferred = 0, over_capacity = 0)
    notes = []
    notes << "#{unfinished} unfinished prior dispatch item(s) were carried forward." if unfinished.positive?
    notes << "#{deferred} eligible item(s) deferred by daily item/capacity limits." if deferred.positive?
    notes << "#{capacity_deferred} item(s) could not fit within crew-day capacity." if capacity_deferred.positive?
    notes << "#{over_capacity} urgent/carry-forward item(s) exceed normal crew-day capacity." if over_capacity.positive?
    notes << "#{blocked} waiting-for-parts/approval item(s) were held out of dispatch." if blocked.positive?
    notes.presence&.join(" ") || "No eligible or blocked items were held out."
  end

  def work_order(work_order, include_dispatch_history: true)
    last_dispatch = include_dispatch_history ? last_dispatch_for(work_order) : nil
    {
      id: work_order.id,
      external_id: work_order.external_id,
      client: work_order.client.name,
      location: work_order.location.name,
      region: work_order.location.region,
      title: work_order.title,
      description: work_order.description,
      created_at: work_order.created_at&.iso8601,
      priority: work_order.priority,
      normalized_priority: work_order.normalized_priority,
      status: work_order.status,
      original_status_text: work_order.original_status_text,
      trade_category: work_order.trade_category,
      requested_at: work_order.requested_at&.iso8601,
      reported_at: work_order.reported_at&.iso8601,
      assessment_due_at: work_order.assessment_due_at&.iso8601,
      response_due_at: work_order.response_due_at&.iso8601,
      repair_due_at: work_order.repair_due_at&.iso8601,
      assessed_at: work_order.assessed_at&.iso8601,
      sla_due_at: work_order.sla_due_at&.iso8601,
      sla_status: sla_status(work_order),
      scheduled_date: work_order.scheduled_date,
      estimated_hours: work_order.estimated_hours&.to_f,
      required_technician_count: work_order.required_technician_count,
      source: work_order.source,
      archived_at: work_order.archived_at&.iso8601,
      archived: work_order.archived?,
      team_name: work_order.team&.name,
      notes: work_order.notes,
      service_line_id: work_order.service_line_id,
      service_line: work_order.service_line&.name,
      pa_project: work_order.pa_project,
      pa_project_notes: work_order.pa_project_notes,
      corrective_maintenance: work_order.corrective_maintenance,
      estimate_required: work_order.estimate_required,
      estimate_number: work_order.estimate_number,
      parts_status: work_order.parts_status,
      parts_ordered: work_order.parts_ordered,
      parts_ordered_at: work_order.parts_ordered_at&.iso8601,
      parts_eta: work_order.parts_eta,
      follow_up_due_on: work_order.follow_up_due_on,
      follow_up_owner: work_order.follow_up_owner,
      vendor_reference: work_order.vendor_reference,
      latest_follow_up_note: work_order.latest_follow_up_note,
      last_dispatched_on: last_dispatch&.dispatch_schedule&.date,
      last_crew_name: last_dispatch&.team&.name,
      last_outcome_status: last_dispatch&.outcome_status
    }
  end

  def sla_status(work_order)
    return "missing" if work_order.sla_missing?
    return "overdue" if work_order.sla_overdue?
    return "due_soon" if work_order.sla_due_soon?

    "on_track"
  end

  def service_line(service_line, work_orders_count: nil)
    {
      id: service_line.id,
      name: service_line.name,
      position: service_line.position,
      active: service_line.active,
      notes: service_line.notes,
      work_orders_count: work_orders_count.nil? ? service_line.work_orders.count : work_orders_count
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
      active: user.respond_to?(:active?) ? user.active? : true,
      invitation_status: user.respond_to?(:invitation_status) ? user.invitation_status : "accepted",
      invitation_pending: user.respond_to?(:invitation_pending?) ? user.invitation_pending? : false,
      invited_at: user.respond_to?(:invited_at) ? user.invited_at&.iso8601 : nil,
      invitation_accepted_at: user.respond_to?(:invitation_accepted_at) ? user.invitation_accepted_at&.iso8601 : nil,
      permissions: {
        can_edit_dispatch: user.can_edit_dispatch?,
        can_admin: user.active? && user.admin?
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
      notes: technician.respond_to?(:notes) ? technician.notes : nil,
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
    today_crew_name = available_techs.map(&:name).join(" / ")
    available_default_techs = default_techs.select { |tech| available_for_date?(tech, date) }

    {
      id: team.id,
      name: team.name,
      today_crew_name: today_crew_name.presence || "No available technicians today",
      region_preference: team.region_preference,
      crew_type: team.respond_to?(:crew_type) ? team.crew_type : "general",
      active: team.respond_to?(:active?) ? team.active? : true,
      archived: team.respond_to?(:archived?) ? team.archived? : false,
      archived_at: team.respond_to?(:archived_at) ? team.archived_at&.iso8601 : nil,
      service_line_ids: team.service_lines.map(&:id),
      service_line_names: team.service_lines.map(&:name),
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
      technician.technician_skills.map(&:skill).sort
    else
      technician.technician_skills.order(:skill).pluck(:skill)
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
      status: pm_task.status,
      completed_at: pm_task.completed_at&.iso8601,
      deferred_until: pm_task.deferred_until,
      notes: pm_task.notes,
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

  def dispatch_team_contexts(schedule)
    teams = schedule.dispatch_items.map(&:team).uniq
    teams.to_h do |team|
      active_technicians = team.available_technicians(schedule.date).order(:name).to_a
      call_outs = team.technicians_for_date(schedule.date)
        .includes(:technician_availabilities)
        .select { |technician| availability_for(technician, schedule.date)&.status == "unavailable" }
        .sort_by(&:name)
      [ team.id, { active_technicians: active_technicians, call_outs: call_outs } ]
    end
  end

  def dispatch_item_technician(snapshot)
    {
      technician_id: snapshot.technician_id,
      name: snapshot.technician_name,
      primary_trade: snapshot.primary_trade,
      is_driver: snapshot.is_driver,
      position: snapshot.position
    }
  end

  def technician_snapshot_fallback(technician)
    {
      technician_id: technician.id,
      name: technician.name,
      primary_trade: technician.primary_trade,
      is_driver: technician.is_driver,
      position: nil
    }
  end

  def dispatch_item(item, team_context:)
    schedulable = item.schedulable
    active_technicians = team_context.fetch(:active_technicians)
    call_outs = team_context.fetch(:call_outs)
    snapshot_technicians = item.dispatch_item_technicians.to_a
    crew_names = snapshot_technicians.present? ? snapshot_technicians.map(&:technician_name) : active_technicians.map(&:name)
    base = {
      id: item.id,
      team_id: item.team_id,
      team_name: item.team.name,
      crew_name: crew_names.join(" / ").presence || "No available technicians",
      technician_names: crew_names,
      assigned_technicians: snapshot_technicians.present? ? snapshot_technicians.map { |snapshot| dispatch_item_technician(snapshot) } : active_technicians.map { |technician| technician_snapshot_fallback(technician) },
      call_out_names: call_outs.map(&:name),
      order_index: item.order_index,
      scheduled_time: item.scheduled_time&.strftime("%H:%M"),
      capacity_overflow: item.capacity_overflow,
      notes: item.notes,
      outcome_status: item.outcome_status,
      outcome_notes: item.outcome_notes,
      completed_at: item.completed_at&.iso8601,
      carried_over_to_date: item.carried_over_to_date,
      reassignment_reason: item.reassignment_reason,
      kind: item.work_order_id ? "work_order" : "pm_task"
    }

    if item.work_order_id
      base.merge(work_order: work_order(schedulable, include_dispatch_history: false))
    else
      base.merge(pm_task: pm_task(schedulable))
    end
  end

  def last_dispatch_for(work_order)
    return work_order.association(:dispatch_items).target.select(&:persisted?).max_by { |item| [ item.dispatch_schedule&.date || Date.new(1900, 1, 1), item.id ] } if work_order.association(:dispatch_items).loaded?

    work_order.dispatch_items.includes(:dispatch_schedule, :team).joins(:dispatch_schedule).order("dispatch_schedules.date DESC", id: :desc).first
  end
end
