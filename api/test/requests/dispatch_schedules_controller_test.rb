require "test_helper"

class DispatchSchedulesControllerTest < ActionDispatch::IntegrationTest
  test "loads the schedule for a requested date" do
    crew = team(name: "Schedule Lookup Crew")
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Lookup work"), order_index: 0)

    with_auth_env do
      get "/api/v1/dispatch_schedules", params: { date: DEFAULT_DATE.to_s }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal schedule.id, payload.dig("schedule", "id")
    assert_equal 1, payload.dig("schedule", "items").size
  end

  test "serializes dispatch items with active crew and call-out context" do
    crew = team(name: "Active Crew Context", skills: [ "General" ], unavailable: false)
    helper = Technician.create!(name: "Unavailable Helper", primary_trade: "General", is_driver: false, active: true)
    helper.technician_availabilities.create!(date: DEFAULT_DATE, status: "unavailable", reason: "Out sick")
    crew.team_memberships.create!(technician: helper)
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Context work"), order_index: 0)

    with_auth_env do
      get "/api/v1/dispatch_schedules", params: { date: DEFAULT_DATE.to_s }, headers: auth_headers
    end

    assert_response :success
    item_payload = JSON.parse(response.body).dig("schedule", "items").first
    assert_equal "Active Crew Context Driver", item_payload.fetch("crew_name")
    assert_equal [ "Active Crew Context Driver" ], item_payload.fetch("technician_names")
    assert_equal [ "Unavailable Helper" ], item_payload.fetch("call_out_names")
  end

  test "returns null schedule when no draft exists for the date" do
    with_auth_env do
      get "/api/v1/dispatch_schedules", params: { date: DEFAULT_DATE.to_s }, headers: auth_headers
    end

    assert_response :success
    assert_nil JSON.parse(response.body).fetch("schedule")
  end

  test "finalizes marks sent and reopens schedule" do
    crew = team(name: "Finalize Crew")
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    work = work_order(title: "Finalize work", status: "needs_assessment", date: DEFAULT_DATE)
    schedule.dispatch_items.create!(team: crew, work_order: work, order_index: 0)

    with_auth_env do
      post "/api/v1/dispatch_schedules/#{schedule.id}/finalize", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "finalized", payload.fetch("status")
    assert payload.fetch("finalized_at")
    assert_equal "Test User", payload.fetch("finalized_by")
    assert_equal "scheduled", work.reload.status

    first_finalized_at = payload.fetch("finalized_at")

    with_auth_env do
      post "/api/v1/dispatch_schedules/#{schedule.id}/finalize", headers: auth_headers
    end

    assert_response :success
    assert_equal first_finalized_at, JSON.parse(response.body).fetch("finalized_at")

    with_auth_env do
      post "/api/v1/dispatch_schedules/#{schedule.id}/mark_sent", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "sent", payload.fetch("status")
    assert payload.fetch("sent_at")
    assert_equal "Test User", payload.fetch("sent_by")
    assert_equal "in_progress", work.reload.status
    first_sent_at = payload.fetch("sent_at")

    with_auth_env do
      post "/api/v1/dispatch_schedules/#{schedule.id}/mark_sent", headers: auth_headers
    end

    assert_response :success
    assert_equal first_sent_at, JSON.parse(response.body).fetch("sent_at")

    with_auth_env do
      post "/api/v1/dispatch_schedules/#{schedule.id}/reopen", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "draft", payload.fetch("status")
    assert_nil payload.fetch("finalized_at")
    assert_nil payload.fetch("sent_at")
    assert_equal "needs_assessment", work.reload.status
    assert_nil schedule.dispatch_items.first.reload.previous_work_order_status
  end

  test "reopen preserves mid-day work order status changes" do
    crew = team(name: "Midday Status Crew")
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    work = work_order(title: "Midday status work", status: "needs_assessment", date: DEFAULT_DATE)
    schedule.dispatch_items.create!(team: crew, work_order: work, order_index: 0)

    with_auth_env do
      post "/api/v1/dispatch_schedules/#{schedule.id}/finalize", headers: auth_headers
      post "/api/v1/dispatch_schedules/#{schedule.id}/mark_sent", headers: auth_headers
      patch "/api/v1/work_orders/#{work.id}/status", params: { status: "waiting_for_parts" }, headers: auth_headers
      post "/api/v1/dispatch_schedules/#{schedule.id}/reopen", headers: auth_headers
    end

    assert_response :success
    assert_equal "waiting_for_parts", work.reload.status
  end

  test "exports WhatsApp-ready crew assignments with active crew context" do
    crew = team(name: "Export Crew", skills: [ "HVAC" ], unavailable: false)
    helper = Technician.create!(name: "Export Helper", primary_trade: "HVAC", is_driver: false, active: true)
    helper.technician_skills.create!(skill: "HVAC")
    helper.technician_availabilities.create!(date: DEFAULT_DATE, status: "unavailable", reason: "Test call-out")
    crew.team_memberships.create!(technician: helper)
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "finalized")
    work = work_order(title: "Export work", priority: "P2", trade: "HVAC")
    schedule.dispatch_items.create!(team: crew, work_order: work, order_index: 0, scheduled_time: "08:30", notes: "Bring ladder")

    with_auth_env do
      get "/api/v1/dispatch_schedules/#{schedule.id}/whatsapp_export", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "finalized", payload.fetch("status")
    assert_includes payload.fetch("message"), "JMI Dispatch - Tuesday, May 5, 2026"
    assert_includes payload.fetch("message"), "EXPORT CREW DRIVER"
    assert_includes payload.fetch("message"), "Crew: Export Crew Driver (Driver)"
    assert_includes payload.fetch("message"), "Out today: Export Helper - Test call-out"
    assert_includes payload.fetch("message"), "8:30 AM - Mobil / Yigo North"
    assert_includes payload.fetch("message"), "WO: #{work.external_id} | P2 | HVAC"
    assert_includes payload.fetch("message"), "Notes: Bring ladder"
    crew_payload = payload.fetch("crews").first
    assert_equal "Export Crew", crew_payload.fetch("team_name")
    assert_equal "Export Crew Driver", crew_payload.fetch("active_team_name")
    assert_equal 1, crew_payload.fetch("stops_count")
    assert_equal [ "Export Crew Driver" ], crew_payload.fetch("technician_names")
    assert_equal [ "Export Crew Driver" ], crew_payload.fetch("driver_names")
    assert_equal "Export Helper", crew_payload.fetch("call_outs").first.fetch("name")
    assert_equal "Test call-out", crew_payload.fetch("call_outs").first.fetch("reason")
  end

  test "schedule state rolls back when audit event cannot be recorded" do
    crew = team(name: "Audit Failure Crew")
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Audit failure work"), order_index: 0)

    invalid_event = AuditEvent.new
    original_record = AuditEvent.method(:record!)
    begin
      AuditEvent.define_singleton_method(:record!) { |**| raise ActiveRecord::RecordInvalid.new(invalid_event) }
      with_auth_env do
        post "/api/v1/dispatch_schedules/#{schedule.id}/finalize", headers: auth_headers
      end
    ensure
      AuditEvent.define_singleton_method(:record!, original_record)
    end

    assert_response :unprocessable_entity
    assert_equal "draft", schedule.reload.status
    assert_nil schedule.finalized_at
  end

  test "suggestion is blocked for finalized schedule until reopened" do
    team(name: "Blocked Suggest Crew")
    work_order(title: "Blocked suggest work")
    DispatchSuggestionService.new(date: DEFAULT_DATE).call.finalize!(dispatcher_user)

    with_auth_env do
      post "/api/v1/dispatch_schedules/suggest", params: { date: DEFAULT_DATE.to_s }, headers: auth_headers
    end

    assert_response :conflict
    assert_includes JSON.parse(response.body).fetch("errors").first, "Reopen it before regenerating"
  end

  private

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers
    dispatcher_user
    { "Authorization" => "Bearer test_token:dispatcher_schedules_123:dispatcher-schedules@example.com" }
  end

  def dispatcher_user
    User.find_or_create_by!(clerk_id: "dispatcher_schedules_123") do |user|
      user.email = "dispatcher-schedules@example.com"
      user.role = "dispatcher"
    end
  end
end
