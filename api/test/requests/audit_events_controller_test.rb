require "test_helper"

class AuditEventsControllerTest < ActionDispatch::IntegrationTest
  test "lists recent audit events" do
    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        description: "Audit work",
        priority: "P2",
        status: "approved"
      }, headers: auth_headers
      assert_response :created
      assert_equal 1, AuditEvent.count
      get "/api/v1/audit_events", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body).fetch("audit_events")
    assert_equal 1, payload.size, response.body
    assert_equal "work_order.created", payload.first.fetch("action")
    assert_equal "Audit work", payload.first.fetch("metadata").fetch("title")
    assert_equal "Test User", payload.first.fetch("user_name")
  end

  test "work order create writes audit event" do
    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        description: "Audit creation",
        priority: "P2",
        status: "approved"
      }, headers: auth_headers
    end

    assert_response :created
    event = AuditEvent.last
    assert_equal "work_order.created", event.action
    assert_equal "Audit creation", event.metadata_hash.fetch("title")
  end

  test "dispatch item update writes audit event" do
    crew = team(name: "Audit Crew")
    schedule = DispatchSuggestionService.new(date: DEFAULT_DATE).call
    item = schedule.dispatch_items.first || schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Audit dispatch"), order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}", params: { notes: "Audit note" }, headers: auth_headers
    end

    assert_response :success
    assert_equal "dispatch_item.updated", AuditEvent.last.action
    assert_equal "Audit note", AuditEvent.last.metadata_hash.fetch("notes")
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
    { "Authorization" => "Bearer test_token:audit_dispatcher_123:audit-dispatcher@example.com" }
  end

  def dispatcher_user
    User.find_or_create_by!(clerk_id: "audit_dispatcher_123") do |user|
      user.email = "audit-dispatcher@example.com"
      user.role = "dispatcher"
    end
  end
end
