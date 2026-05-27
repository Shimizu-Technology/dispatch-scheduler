require "test_helper"

class TeamsControllerTest < ActionDispatch::IntegrationTest
  test "index separates default crew name from today's daily crew" do
    crew = team(name: "ANTON / RONEL", skills: [ "General" ], driver: false)
    driver = Technician.create!(name: "RONALD", primary_trade: "General", is_driver: true, active: true)
    driver.technician_skills.create!(skill: "General")

    with_auth_env do
      patch "/api/v1/teams/#{crew.id}/daily_memberships", params: { date: DEFAULT_DATE, technician_ids: [ crew.technicians.first.id, driver.id ] }, headers: auth_headers
      get "/api/v1/teams", params: { date: DEFAULT_DATE }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body).find { |candidate| candidate.fetch("id") == crew.id }
    assert_equal "ANTON / RONEL", payload.fetch("name")
    assert_equal "#{crew.technicians.first.name} / RONALD", payload.fetch("today_crew_name")
    assert_equal [ crew.technicians.first.name ], payload.fetch("default_technicians").map { |tech| tech.fetch("name") }
    assert_equal true, payload.fetch("daily_override")
  end

  test "index shows active today crew name while retaining unavailable technician rows" do
    crew = team(name: "Active Today Crew", skills: [ "General" ], driver: true)
    helper = Technician.create!(name: "Out Helper", primary_trade: "General", is_driver: false, active: true)
    helper.technician_availabilities.create!(date: DEFAULT_DATE, status: "unavailable", reason: "Sick")
    crew.team_memberships.create!(technician: helper)

    with_auth_env do
      get "/api/v1/teams", params: { date: DEFAULT_DATE }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body).find { |candidate| candidate.fetch("id") == crew.id }
    assert_equal "Active Today Crew Driver", payload.fetch("today_crew_name")
    assert_equal [ "Active Today Crew Driver", "Out Helper" ], payload.fetch("technicians").map { |tech| tech.fetch("name") }
    assert_equal "unavailable", payload.fetch("technicians").find { |tech| tech.fetch("name") == "Out Helper" }.fetch("availability")
  end

  test "dispatcher creates archives and assigns service line preferences to a default crew" do
    driver = Technician.create!(name: "Preference Driver", primary_trade: "General", is_driver: true, active: true)
    service_line = ServiceLine.create!(name: "Mobil / CBRE", position: 1)

    with_auth_env do
      post "/api/v1/teams", params: { technician_ids: [ driver.id ], region_preference: "North", crew_type: "PM", service_line_ids: [ service_line.id ] }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body)
    assert_equal "PM", payload.fetch("crew_type")
    assert_equal [ service_line.id ], payload.fetch("service_line_ids")
    assert_equal [ "Mobil / CBRE" ], payload.fetch("service_line_names")

    team = Team.find(payload.fetch("id"))
    with_auth_env do
      delete "/api/v1/teams/#{team.id}", headers: auth_headers
    end

    assert_response :success
    assert_equal false, team.reload.active?
    assert team.archived_at.present?
  end

  test "dispatcher creates a default crew" do
    driver = Technician.create!(name: "New Crew Driver", primary_trade: "General", is_driver: true, active: true)
    helper = Technician.create!(name: "New Crew Helper", primary_trade: "Helper", is_driver: false, active: true)

    with_auth_env do
      post "/api/v1/teams", params: { technician_ids: [ driver.id, helper.id ], region_preference: "North" }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body)
    assert_equal "New Crew Driver / New Crew Helper", payload.fetch("name")
    assert_equal "North", payload.fetch("region_preference")
    assert_equal true, payload.fetch("has_driver")
    assert_equal [ "New Crew Driver", "New Crew Helper" ], payload.fetch("default_technicians").map { |tech| tech.fetch("name") }
    assert_equal true, payload.fetch("default_has_driver")
    assert_equal "team.created", AuditEvent.last.action
  end

  test "dispatcher updates a default crew without clearing daily override" do
    crew = team(name: "Original Default", skills: [ "General" ], driver: false)
    original_tech = crew.technicians.first
    daily_driver = Technician.create!(name: "Daily Driver", primary_trade: "General", is_driver: true, active: true)
    daily_driver.technician_skills.create!(skill: "General")
    new_default_driver = Technician.create!(name: "New Default Driver", primary_trade: "Electrical", is_driver: true, active: true)
    new_default_driver.technician_skills.create!(skill: "Electrical")

    with_auth_env do
      patch "/api/v1/teams/#{crew.id}/daily_memberships", params: { date: DEFAULT_DATE, technician_ids: [ original_tech.id, daily_driver.id ] }, headers: auth_headers
      patch "/api/v1/teams/#{crew.id}", params: { date: DEFAULT_DATE, name: "Updated Default", region_preference: "North", technician_ids: [ new_default_driver.id ] }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "Updated Default", payload.fetch("name")
    assert_equal "North", payload.fetch("region_preference")
    assert_equal true, payload.fetch("daily_override")
    assert_equal [ "Original Default Driver", "Daily Driver" ].sort, payload.fetch("technicians").map { |tech| tech.fetch("name") }.sort
    assert_equal [ "New Default Driver" ], payload.fetch("default_technicians").map { |tech| tech.fetch("name") }
    assert_equal true, payload.fetch("default_has_driver")
    assert_equal "team.default_crew.updated", AuditEvent.last.action
  end

  test "dispatcher cannot empty a default crew" do
    crew = team(name: "Cannot Empty Default")

    with_auth_env do
      patch "/api/v1/teams/#{crew.id}", params: { technician_ids: [] }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    payload = JSON.parse(response.body)
    assert_includes payload.fetch("errors"), "Select at least one technician for the default crew."
    assert_equal [ "Cannot Empty Default Driver" ], crew.reload.team_memberships.where(date: nil).includes(:technician).map { |membership| membership.technician.name }
  end

  test "dispatcher cannot create an empty default crew" do
    with_auth_env do
      post "/api/v1/teams", params: { technician_ids: [] }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    payload = JSON.parse(response.body)
    assert_includes payload.fetch("errors"), "Select at least one technician for the default crew."
  end

  test "viewer cannot update a default crew" do
    crew = team(name: "Viewer Default Locked")

    with_auth_env do
      patch "/api/v1/teams/#{crew.id}", params: { technician_ids: [] }, headers: auth_headers("viewer_team_update_123", "viewer-team-update@example.com")
    end

    assert_response :forbidden
  end

  test "viewer cannot create a default crew" do
    with_auth_env do
      post "/api/v1/teams", params: { technician_ids: [] }, headers: auth_headers("viewer_team_create_123", "viewer-team-create@example.com")
    end

    assert_response :forbidden
  end

  test "dispatcher sets and clears daily crew composition" do
    source_team = team(name: "Default Crew", skills: [ "Plumbing" ], driver: true)
    borrowed_tech = Technician.create!(name: "Borrowed Helper", primary_trade: "Electrical", is_driver: false, active: true)
    borrowed_tech.technician_skills.create!(skill: "Electrical")

    with_auth_env do
      patch "/api/v1/teams/#{source_team.id}/daily_memberships", params: { date: DEFAULT_DATE, technician_ids: [ borrowed_tech.id ] }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal true, payload.fetch("daily_override")
    assert_equal [ borrowed_tech.id ], payload.fetch("technicians").map { |tech| tech.fetch("id") }
    assert_equal false, payload.fetch("has_driver")
    assert_equal [ borrowed_tech.id ], source_team.technicians_for_date(DEFAULT_DATE).pluck(:id)

    with_auth_env do
      patch "/api/v1/teams/#{source_team.id}/daily_memberships", params: { date: DEFAULT_DATE, use_default: true }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal false, payload.fetch("daily_override")
    assert_equal [ "#{source_team.name} Driver" ], payload.fetch("technicians").map { |tech| tech.fetch("name") }
    assert_equal true, payload.fetch("has_driver")

    clear_metadata = AuditEvent.last.metadata_hash
    assert_equal "team.daily_crew.cleared", AuditEvent.last.action
    assert_equal [ borrowed_tech.id ], clear_metadata.fetch("previous_technician_ids")
    assert_equal [ "Borrowed Helper" ], clear_metadata.fetch("previous_technician_names")
    assert_equal [ source_team.technicians.first.id ], clear_metadata.fetch("technician_ids")
    assert_equal [ "#{source_team.name} Driver" ], clear_metadata.fetch("technician_names")
  end

  test "dispatcher can save an intentionally empty daily crew" do
    crew = team(name: "Empty Override Crew", skills: [ "General" ], driver: true)

    with_auth_env do
      patch "/api/v1/teams/#{crew.id}/daily_memberships", params: { date: DEFAULT_DATE, technician_ids: [] }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal true, payload.fetch("daily_override")
    assert_empty payload.fetch("technicians")
    assert_equal false, payload.fetch("has_driver")
    assert_empty crew.technicians_for_date(DEFAULT_DATE).pluck(:id)
  end

  test "viewer cannot set daily crew composition" do
    crew = team(name: "Viewer Locked Crew")

    with_auth_env do
      patch "/api/v1/teams/#{crew.id}/daily_memberships", params: { date: DEFAULT_DATE, technician_ids: [] }, headers: auth_headers("viewer_teams_123", "viewer-teams@example.com")
    end

    assert_response :forbidden
  end

  test "bare dated memberships without override marker do not affect scheduler" do
    crew = team(name: "Legacy Dated Crew", skills: [ "General" ], driver: true)
    borrowed_tech = Technician.create!(name: "Legacy Borrowed", primary_trade: "HVAC", is_driver: true, active: true)
    borrowed_tech.technician_skills.create!(skill: "HVAC")
    crew.team_memberships.create!(date: DEFAULT_DATE, technician: borrowed_tech)

    refute crew.daily_override?(DEFAULT_DATE)
    assert_equal [ "#{crew.name} Driver" ], crew.technicians_for_date(DEFAULT_DATE).map(&:name)
  end

  test "scheduler uses daily crew override skills" do
    hvac_team = team(name: "HVAC Default", skills: [ "HVAC" ], driver: true)
    plumbing_team = team(name: "Plumbing Default", skills: [ "Plumbing" ], driver: true)
    hvac_driver = hvac_team.technicians.first
    work_order(title: "AC repair", trade: "HVAC")

    with_auth_env do
      patch "/api/v1/teams/#{hvac_team.id}/daily_memberships", params: { date: DEFAULT_DATE, technician_ids: [ plumbing_team.technicians.first.id ] }, headers: auth_headers
      patch "/api/v1/teams/#{plumbing_team.id}/daily_memberships", params: { date: DEFAULT_DATE, technician_ids: [ hvac_driver.id ] }, headers: auth_headers
    end

    schedule = DispatchSuggestionService.new(date: DEFAULT_DATE).call
    item = schedule.dispatch_items.first

    assert_equal plumbing_team.id, item.team_id
  end

  private

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers(clerk_id = "dispatcher_teams_123", email = "dispatcher-teams@example.com")
    User.find_or_create_by!(clerk_id: clerk_id) do |user|
      user.email = email
      user.role = email.start_with?("viewer") ? "viewer" : "dispatcher"
    end
    { "Authorization" => "Bearer test_token:#{clerk_id}:#{email}" }
  end
end
