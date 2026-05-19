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
    assert_equal "team.created", AuditEvent.last.action
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
