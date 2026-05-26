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

  test "invalid scheduled date rolls back client and location writes" do
    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Rollback Client",
        location: "Rollback Site",
        region: "North",
        description: "Bad date request",
        scheduled_date: "not-a-date"
      }, headers: auth_headers
    end

    assert_response :bad_request
    assert_equal [ "Invalid scheduled date" ], JSON.parse(response.body).fetch("errors")
    assert_nil Client.find_by(name: "Rollback Client")
    assert_nil Location.find_by(name: "Rollback Site")
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

  test "dispatcher creates work order with operational tracking fields" do
    service_line = service_line("Mobil / CBRE")

    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        region: "North",
        source: "mywork",
        description: "Long lead lighting repair",
        service_line_id: service_line.id,
        pa_project: true,
        pa_project_notes: "Waiting for lights until September",
        corrective_maintenance: true,
        estimate_required: true
      }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body)
    assert_equal service_line.id, payload.fetch("service_line_id")
    assert_equal "Mobil / CBRE", payload.fetch("service_line")
    assert_equal true, payload.fetch("pa_project")
    assert_equal "Waiting for lights until September", payload.fetch("pa_project_notes")
    assert_equal true, payload.fetch("corrective_maintenance")
    assert_equal true, payload.fetch("estimate_required")
  end

  test "rejects inactive service line assignment" do
    inactive = ServiceLine.create!(name: "Retired", position: 90, active: false)

    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        description: "Retired service line should not be assigned",
        service_line_id: inactive.id
      }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal [ "Inactive service lines cannot be assigned to work orders" ], JSON.parse(response.body).fetch("errors")
  end

  test "allows existing inactive service line to remain assigned while editing other fields" do
    inactive = ServiceLine.create!(name: "Retired", position: 90, active: false)
    wo = work_order(title: "Legacy retired line", service_line_record: inactive)

    with_auth_env do
      patch "/api/v1/work_orders/#{wo.id}", params: {
        client: wo.client.name,
        location: wo.location.name,
        region: wo.location.region,
        source: wo.source,
        description: "Updated notes for legacy service line",
        status: wo.status,
        service_line_id: inactive.id,
        notes: "Keep old line until admin reclassifies"
      }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal inactive.id, payload.fetch("service_line_id")
    assert_equal "Keep old line until admin reclassifies", payload.fetch("notes")
  end

  test "filters by operational tracking fields" do
    mobil = service_line("Mobil / CBRE")
    schools = service_line("Public Schools / Sodexo")
    match = work_order(title: "PA lighting", service_line_record: mobil)
    match.update!(pa_project: true, corrective_maintenance: true, estimate_required: true)
    work_order(title: "School freezer", service_line_record: schools)

    with_auth_env do
      get "/api/v1/work_orders", params: { service_line_id: mobil.id, pa_project: true, corrective_maintenance: true, estimate_required: true }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal [ match.id ], payload.map { |item| item.fetch("id") }
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

  test "updates work order status with audit trail" do
    wo = work_order(title: "Status candidate", status: "needs_assessment")

    with_auth_env do
      patch "/api/v1/work_orders/#{wo.id}/status", params: { status: "in_progress" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "in_progress", payload.fetch("status")
    assert_equal "in_progress", wo.reload.status
    assert_equal "work_order.status_updated", AuditEvent.last.action
    assert_equal "needs_assessment", AuditEvent.last.metadata_hash.fetch("previous_status")
    assert_equal "in_progress", AuditEvent.last.metadata_hash.fetch("new_status")
  end

  test "rejects invalid work order status" do
    wo = work_order(title: "Bad status candidate")

    with_auth_env do
      patch "/api/v1/work_orders/#{wo.id}/status", params: { status: "half_done" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal [ "Invalid work order status" ], JSON.parse(response.body).fetch("errors")
  end

  test "archives and restores work orders" do
    wo = work_order(title: "Archive candidate")

    with_auth_env do
      patch "/api/v1/work_orders/#{wo.id}/archive", headers: auth_headers
    end

    assert_response :success
    assert wo.reload.archived?
    assert_equal "work_order.archived", AuditEvent.last.action
    assert_equal true, JSON.parse(response.body).fetch("archived")

    with_auth_env do
      get "/api/v1/work_orders", headers: auth_headers
    end
    assert_response :success
    assert_empty JSON.parse(response.body)

    with_auth_env do
      get "/api/v1/work_orders", params: { archived: "only" }, headers: auth_headers
    end
    assert_response :success
    assert_equal [ wo.id ], JSON.parse(response.body).map { |item| item.fetch("id") }

    with_auth_env do
      patch "/api/v1/work_orders/#{wo.id}/unarchive", headers: auth_headers
    end

    assert_response :success
    refute wo.reload.archived?
    assert_equal "work_order.unarchived", AuditEvent.last.action
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
