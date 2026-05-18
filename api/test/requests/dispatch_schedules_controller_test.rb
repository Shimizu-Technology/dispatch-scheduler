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

  private

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers
    User.find_or_create_by!(clerk_id: "dispatcher_schedules_123") do |user|
      user.email = "dispatcher-schedules@example.com"
      user.role = "dispatcher"
    end
    { "Authorization" => "Bearer test_token:dispatcher_schedules_123:dispatcher-schedules@example.com" }
  end
end
