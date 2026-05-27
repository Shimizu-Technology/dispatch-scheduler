module DispatchTestData
  DEFAULT_DATE = Date.new(2026, 5, 5)

  def reset_dispatch_records
    [ AuditEvent, FollowUp, DispatchItem, DispatchSchedule, WorkOrder, PmTask, TeamMembership, TeamDailyOverride, TechnicianAvailability, TechnicianSkill, Technician, Team, Location, Client, ServiceLine, User ].each(&:delete_all)
  end

  def client(name = "Mobil")
    Client.find_or_create_by!(name: name)
  end

  def location(name: "Yigo North", region: "North", client_record: client)
    Location.find_or_create_by!(client: client_record, name: name) do |loc|
      loc.region = region
    end
  end

  def team(name: "Team A", skills: [ "General" ], driver: true, unavailable: false, date: DEFAULT_DATE, region: nil)
    team = Team.create!(name: name, region_preference: region)
    tech = Technician.create!(name: "#{name} Driver", primary_trade: skills.first, is_driver: driver, active: true)
    skills.each { |skill| tech.technician_skills.create!(skill: skill) }
    tech.technician_availabilities.create!(date: date, status: "unavailable", reason: "Test call-out") if unavailable
    team.team_memberships.create!(technician: tech)
    team
  end

  def service_line(name = "Mobil / CBRE")
    ServiceLine.find_or_create_by!(name: name) do |line|
      line.position = 10
      line.active = true
    end
  end

  def work_order(title: "Repair item", priority: "P4", status: "approved", trade: "General", date: DEFAULT_DATE, location_record: location, service_line_record: service_line, reported_at: nil)
    WorkOrder.create!(
      client: location_record.client,
      location: location_record,
      external_id: SecureRandom.hex(3),
      source: "test",
      title: title,
      description: title,
      priority: priority,
      normalized_priority: priority,
      status: status,
      original_status_text: status,
      trade_category: trade,
      scheduled_date: date,
      service_line: service_line_record,
      reported_at: reported_at
    )
  end

  def pm_task(task_name: "PM inspection", trade: "General", date: DEFAULT_DATE, location_record: location)
    PmTask.create!(
      client: location_record.client,
      location: location_record,
      task_name: task_name,
      trade_category: trade,
      frequency: "monthly",
      scheduled_date: date,
      status: "pending",
      source_file: "test.xlsx"
    )
  end
end
