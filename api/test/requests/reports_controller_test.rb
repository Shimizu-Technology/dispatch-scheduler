require "test_helper"

class ReportsControllerTest < ActionDispatch::IntegrationTest
  test "dispatcher downloads monthly report JSON and CSV" do
    work_order(title: "Report work", reported_at: Time.zone.local(2026, 6, 1, 8, 0), status: "waiting_for_parts").update!(parts_status: "Ordered", follow_up_due_on: Date.new(2026, 6, 10))

    with_auth_env do
      get "/api/v1/reports/monthly", params: { month: "2026-06" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "2026-06", payload.fetch("month")
    assert_equal 1, payload.dig("work_orders", "total")
    assert_equal 1, payload.dig("work_orders", "waiting_for_parts")

    with_auth_env do
      get "/api/v1/reports/monthly.csv", params: { month: "2026-06" }, headers: auth_headers
    end

    assert_response :success
    assert_equal "text/csv", response.media_type
    assert_includes response.body, "Report work"
    assert_includes response.body, "Ordered"
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
    User.find_or_create_by!(clerk_id: "dispatcher_reports_123") do |user|
      user.email = "dispatcher-reports@example.com"
      user.role = "dispatcher"
    end
    { "Authorization" => "Bearer test_token:dispatcher_reports_123:dispatcher-reports@example.com" }
  end
end
