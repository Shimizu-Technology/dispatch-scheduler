require "test_helper"

class DashboardControllerTest < ActionDispatch::IntegrationTest
  test "dashboard counts exclude archived work orders" do
    work_order(title: "Active assessment", status: "needs_assessment", priority: "P1")
    work_order(title: "Archived assessment", status: "needs_assessment", priority: "P1").update!(archived_at: Time.current)
    work_order(title: "Archived approved", status: "approved", priority: "P2").update!(archived_at: Time.current)

    with_auth_env do
      get "/api/v1/dashboard", params: { date: DEFAULT_DATE.to_s }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 1, payload.dig("counts", "open_work_orders")
    assert_equal 1, payload.dig("counts", "high_priority_open_work_orders")
    assert_equal 1, payload.dig("counts", "needs_assessment")
    assert_equal 0, payload.dig("counts", "approved")
    assert_equal 0, payload.dig("counts", "unscheduled_approved")
    assert_equal({ "needs_assessment" => 1 }, payload.fetch("status_breakdown"))
    assert_equal({ "P1" => 1 }, payload.fetch("priority_breakdown"))
  end

  test "dashboard excludes PA Projects from KPI pressure while counting PA follow-up" do
    reported_at = Time.zone.local(2026, 4, 20, 8, 0, 0)
    work_order(title: "Normal overdue", status: "approved", priority: "P2", date: nil, reported_at: reported_at)
    work_order(title: "PA overdue", status: "approved", priority: "P2", date: nil, reported_at: reported_at, pa_project: true)

    with_auth_env do
      get "/api/v1/dashboard", params: { date: DEFAULT_DATE.to_s }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 2, payload.dig("counts", "open_work_orders")
    assert_equal 1, payload.dig("counts", "pa_projects")
    assert_equal 1, payload.dig("counts", "sla_overdue")
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
    User.find_or_create_by!(clerk_id: "dashboard_dispatcher_123") do |user|
      user.email = "dashboard-dispatcher@example.com"
      user.role = "dispatcher"
    end
    { "Authorization" => "Bearer test_token:dashboard_dispatcher_123:dashboard-dispatcher@example.com" }
  end
end
