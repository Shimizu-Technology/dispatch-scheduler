require "json"

seed_path = Rails.root.parent.join("data", "seeds", "sample_data.json")
abort "Missing seed data at #{seed_path}. Run scripts/import_sample_data.py from repo root." unless File.exist?(seed_path)

data = JSON.parse(File.read(seed_path))

[ FollowUp, DispatchItem, DispatchSchedule, WorkOrder, PmTask, TeamMembership, TechnicianAvailability, TechnicianSkill, Technician, Team, Location, Client ].each(&:delete_all)

clients = {}
locations = {}
technicians = {}
teams = {}

(data["work_orders"].map { |w| w["client"] } + data["pm_tasks"].map { |p| p["client"] }).compact.uniq.each do |name|
  clients[name] = Client.create!(name: name)
end

(data["work_orders"].map { |w| [ w["client"], w["location"], w["region"] ] } + data["pm_tasks"].map { |p| [ p["client"], p["location"], p["region"] ] }).uniq.each do |client_name, location_name, region|
  next unless client_name && location_name
  key = [ client_name, location_name ]
  locations[key] = Location.create!(client: clients[client_name], name: location_name, region: region)
end

data["technicians"].each do |attrs|
  technician = Technician.create!(name: attrs["name"], primary_trade: attrs["primary_trade"], is_driver: attrs["is_driver"], active: attrs["active"])
  attrs["skills"].each { |skill| technician.technician_skills.create!(skill: skill) }
  technicians[technician.name.upcase] = technician
end

data["teams"].each_with_index do |attrs, index|
  team = Team.create!(name: attrs["name"], region_preference: attrs["region_preference"], notes: "Imported demo team from sample schedule")
  attrs["members"].each do |member|
    tech = technicians[member.upcase]
    team.team_memberships.create!(technician: tech) if tech
  end
  teams[team.name] = team
end

# A demo call-out to prove the daily availability UX matters.
if (tech = technicians["MARVIN"])
  tech.technician_availabilities.create!(date: Date.new(2026, 5, 4), status: "unavailable", reason: "Demo call-out")
end

data["work_orders"].each do |attrs|
  client = clients[attrs["client"]]
  location = locations[[ attrs["client"], attrs["location"] ]]
  team = teams[attrs["team_name"]]
  WorkOrder.create!(
    client: client,
    location: location,
    team: team,
    external_id: attrs["external_id"],
    source: attrs["source"],
    source_reference: attrs["source_reference"],
    title: attrs["title"],
    description: attrs["description"],
    priority: attrs["priority"],
    normalized_priority: attrs["normalized_priority"],
    status: attrs["status"],
    original_status_text: attrs["original_status_text"],
    trade_category: attrs["trade_category"],
    scheduled_date: attrs["scheduled_date"],
    notes: attrs["notes"]
  )
end

data["pm_tasks"].each do |attrs|
  PmTask.create!(
    client: clients[attrs["client"]],
    location: locations[[ attrs["client"], attrs["location"] ]],
    task_name: attrs["task_name"],
    trade_category: attrs["trade_category"],
    frequency: attrs["frequency"],
    scheduled_date: attrs["scheduled_date"],
    source_file: attrs["source_file"]
  )
end

puts "Seeded #{Client.count} clients, #{Location.count} locations, #{Technician.count} technicians, #{Team.count} teams, #{WorkOrder.count} work orders, #{PmTask.count} PM tasks"
