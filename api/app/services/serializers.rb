module Serializers
  module_function

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
