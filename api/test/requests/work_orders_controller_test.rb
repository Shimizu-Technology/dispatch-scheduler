require "test_helper"

class WorkOrdersControllerTest < ActionDispatch::IntegrationTest
  test "dispatcher creates manual work order" do
    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        region: "North",
        external_id: "WO-100",
        source: "whatsapp",
        description: "Bathroom sink is leaking",
        priority: "P2",
        status: "approved",
        trade_category: "Plumbing",
        scheduled_date: DEFAULT_DATE.to_s,
        notes: "Requested by station manager"
      }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body)
    assert_equal "WO-100", payload.fetch("external_id")
    assert_equal "Mobil", payload.fetch("client")
    assert_equal "Yigo", payload.fetch("location")
    assert_equal "North", payload.fetch("region")
    assert_equal "whatsapp", payload.fetch("source")
    assert_equal "Plumbing", payload.fetch("trade_category")
    assert_equal DEFAULT_DATE.to_s, payload.fetch("scheduled_date")
  end

  test "dispatcher updates work order" do
    wo = work_order(title: "Old issue", status: "needs_assessment", trade: "General")

    with_auth_env do
      patch "/api/v1/work_orders/#{wo.id}", params: {
        client: wo.client.name,
        location: wo.location.name,
        region: wo.location.region,
        external_id: wo.external_id,
        source: wo.source,
        description: "Leak was approved for repair",
        priority: "P1",
        status: "approved",
        trade_category: "Plumbing",
        notes: "Parts confirmed"
      }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "approved", payload.fetch("status")
    assert_equal "P1", payload.fetch("normalized_priority")
    assert_equal "Plumbing", payload.fetch("trade_category")
    assert_equal "Parts confirmed", payload.fetch("notes")
  end

  test "duplicate source and external id is rejected" do
    work_order(title: "Existing", status: "approved").update!(source: "mywork", external_id: "40787")

    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        source: "mywork",
        external_id: "40787",
        description: "Duplicate request"
      }, headers: auth_headers
    end

    assert_response :conflict
    assert_includes JSON.parse(response.body).fetch("errors"), "A work order with this source and WO number already exists"
  end

  test "filters and searches work orders" do
    north = location(name: "Yigo", region: "North")
    south = location(name: "Agat", region: "South")
    work_order(title: "Sink leak", priority: "P2", trade: "Plumbing", location_record: north)
    work_order(title: "AC not cooling", priority: "P1", trade: "HVAC", location_record: south)

    with_auth_env do
      get "/api/v1/work_orders", params: { q: "sink", region: "North", trade_category: "Plumbing" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 1, payload.size
    assert_equal "Sink leak", payload.first.fetch("title")
  end

  test "filters by submitted scheduled date" do
    today_order = work_order(title: "Today work", date: Date.current)
    requested_date_order = work_order(title: "Requested date work", date: DEFAULT_DATE + 2.days)

    with_auth_env do
      get "/api/v1/work_orders", params: { scheduled_date: (DEFAULT_DATE + 2.days).to_s }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal [ requested_date_order.id ], payload.map { |item| item.fetch("id") }
    refute_includes payload.map { |item| item.fetch("id") }, today_order.id
  end

  test "combines client region and search filters without duplicate rows" do
    mobil = client("Mobil")
    sodexo = client("Sodexo")
    north = location(name: "Yigo", region: "North", client_record: mobil)
    also_north = location(name: "Dededo", region: "North", client_record: mobil)
    south = location(name: "Agat", region: "South", client_record: sodexo)
    match = work_order(title: "Sink leak", trade: "Plumbing", location_record: north)
    work_order(title: "Sink leak", trade: "Plumbing", location_record: also_north)
    work_order(title: "Sink leak", trade: "Plumbing", location_record: south)

    with_auth_env do
      get "/api/v1/work_orders", params: { q: "Yigo", client: "Mobil", region: "North" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal [ match.id ], payload.map { |item| item.fetch("id") }
  end

  test "viewer cannot create work order" do
    with_auth_env do
      post "/api/v1/work_orders", params: { description: "New request" }, headers: auth_headers("viewer_work_orders_123", "viewer-work-orders@example.com")
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

  def auth_headers(clerk_id = "dispatcher_work_orders_123", email = "dispatcher-work-orders@example.com")
    User.find_or_create_by!(clerk_id: clerk_id) do |user|
      user.email = email
      user.role = email.start_with?("viewer") ? "viewer" : "dispatcher"
    end
    { "Authorization" => "Bearer test_token:#{clerk_id}:#{email}" }
  end
end
