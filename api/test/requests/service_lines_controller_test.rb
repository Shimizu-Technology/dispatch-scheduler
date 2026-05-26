require "test_helper"

class ServiceLinesControllerTest < ActionDispatch::IntegrationTest
  test "lists active service lines in configured order with aggregate work order counts" do
    general = ServiceLine.create!(name: "General", position: 20, active: true)
    ServiceLine.create!(name: "Archived", position: 10, active: false)
    mobil = ServiceLine.create!(name: "Mobil / CBRE", position: 5, active: true)
    work_order(title: "Mobil 1", service_line_record: mobil)
    work_order(title: "Mobil 2", service_line_record: mobil)
    work_order(title: "General", service_line_record: general)

    with_auth_env do
      get "/api/v1/service_lines", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body).fetch("service_lines")
    assert_equal [ "Mobil / CBRE", "General" ], payload.map { |line| line.fetch("name") }
    assert_equal [ 2, 1 ], payload.map { |line| line.fetch("work_orders_count") }
  end

  test "admin creates and updates service line" do
    with_auth_env do
      post "/api/v1/service_lines", params: { name: "Public Schools / Sodexo", position: 30, notes: "School contract" }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body).fetch("service_line")
    assert_equal "Public Schools / Sodexo", payload.fetch("name")
    assert_equal "service_line.created", AuditEvent.last.action

    with_auth_env do
      patch "/api/v1/service_lines/#{payload.fetch("id")}", params: { name: "Schools / Sodexo", active: false }, headers: auth_headers
    end

    assert_response :success
    updated = JSON.parse(response.body).fetch("service_line")
    assert_equal "Schools / Sodexo", updated.fetch("name")
    assert_equal false, updated.fetch("active")
    assert_equal "service_line.updated", AuditEvent.last.action
  end

  test "dispatcher cannot manage service lines" do
    with_auth_env do
      post "/api/v1/service_lines", params: { name: "HKR" }, headers: auth_headers("dispatcher_service_lines_123", "dispatcher-service-lines@example.com", "dispatcher")
    end

    assert_response :forbidden
  end

  private

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers(clerk_id = "admin_service_lines_123", email = "admin-service-lines@example.com", role = "admin")
    User.find_or_create_by!(clerk_id: clerk_id) do |user|
      user.email = email
      user.role = role
    end
    { "Authorization" => "Bearer test_token:#{clerk_id}:#{email}" }
  end
end
