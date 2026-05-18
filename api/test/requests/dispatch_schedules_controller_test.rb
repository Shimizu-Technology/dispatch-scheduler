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
    schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Finalize work"), order_index: 0)

    with_auth_env do
      post "/api/v1/dispatch_schedules/#{schedule.id}/finalize", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "finalized", payload.fetch("status")
    assert payload.fetch("finalized_at")
    assert_equal "Test User", payload.fetch("finalized_by")

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
