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
        estimated_hours: "1.5",
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
    assert_equal 1.5, payload.fetch("estimated_hours")
  end

  test "creating a reviewed work order atomically approves its durable intake item" do
    reviewer = User.create!(clerk_id: "dispatcher_work_orders_123", email: "dispatcher-work-orders@example.com", role: "dispatcher")
    work_order_import = WorkOrderImport.create!(
      user: reviewer,
      source_kind: "pasted_text",
      source_text: "Bathroom sink is leaking",
      source_sha256: "reviewed-draft",
      extraction_model: "test-model",
      extracted_at: Time.current
    )
    item = work_order_import.items.create!(position: 0, extracted_data: { description: "Bathroom sink is leaking" })

    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        region: "North",
        source: "pasted_text",
        description: "Bathroom sink is leaking",
        priority: "P2",
        status: "approved",
        trade_category: "Plumbing",
        work_order_import_item_id: item.id
      }, headers: auth_headers
    end

    assert_response :created
    created = WorkOrder.find(JSON.parse(response.body).fetch("id"))
    assert_equal "approved", item.reload.status
    assert_equal created, item.work_order
    assert_equal "completed", work_order_import.reload.status
    assert_equal 1, AuditEvent.where(action: "work_order_import.approved", record_type: "WorkOrderImport", record_id: work_order_import.id).count
  end

  test "dispatcher cannot approve another uploader's intake item" do
    uploader = User.create!(clerk_id: "other_dispatcher_123", email: "other-dispatcher@example.com", role: "dispatcher")
    work_order_import = WorkOrderImport.create!(
      user: uploader,
      source_kind: "pasted_text",
      source_text: "Bathroom sink is leaking",
      source_sha256: "other-review-draft",
      extraction_model: "test-model",
      extracted_at: Time.current
    )
    item = work_order_import.items.create!(position: 0, extracted_data: { description: "Bathroom sink is leaking" })

    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        region: "North",
        source: "pasted_text",
        description: "Bathroom sink is leaking",
        priority: "P2",
        status: "approved",
        trade_category: "Plumbing",
        work_order_import_item_id: item.id
      }, headers: auth_headers
    end

    assert_response :not_found
    assert_equal "pending", item.reload.status
    assert_nil item.work_order
    assert_equal 0, WorkOrder.count
    assert_equal 0, AuditEvent.where(record_type: "WorkOrderImport", record_id: work_order_import.id).count
  end

  test "already-reviewed intake item returns a validation error instead of creating a work order" do
    reviewer = User.create!(clerk_id: "dispatcher_work_orders_123", email: "dispatcher-work-orders@example.com", role: "dispatcher")
    work_order_import = WorkOrderImport.create!(
      user: reviewer,
      source_kind: "pasted_text",
      source_text: "Already rejected request",
      source_sha256: "already-reviewed-draft",
      extraction_model: "test-model",
      extracted_at: Time.current
    )
    item = work_order_import.items.create!(position: 0, extracted_data: { description: "Already rejected request" })
    item.reject!(user: reviewer)

    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        region: "North",
        source: "pasted_text",
        description: "Already rejected request",
        priority: "P2",
        status: "approved",
        trade_category: "General",
        work_order_import_item_id: item.id
      }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal [ "This intake draft has already been reviewed" ], JSON.parse(response.body).fetch("errors")
    assert_equal "rejected", item.reload.status
    assert_nil item.work_order
    assert_equal 0, WorkOrder.count
    assert_equal 0, AuditEvent.where(action: "work_order_import.approved", record_type: "WorkOrderImport", record_id: work_order_import.id).count
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
        estimate_required: true,
        estimate_number: "EST-55",
        parts_status: "Ordered from vendor",
        parts_ordered: true,
        parts_ordered_at: "2026-05-05T10:30:00+10:00",
        parts_eta: "2026-05-20",
        follow_up_due_on: "2026-05-12",
        follow_up_owner: "John",
        vendor_reference: "PO-55",
        latest_follow_up_note: "Vendor confirmed ETA"
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
    assert_equal "EST-55", payload.fetch("estimate_number")
    assert_equal "Ordered from vendor", payload.fetch("parts_status")
    assert_equal true, payload.fetch("parts_ordered")
    assert_equal "2026-05-20", payload.fetch("parts_eta")
    assert_equal "2026-05-12", payload.fetch("follow_up_due_on")
    assert_equal "John", payload.fetch("follow_up_owner")
    assert_equal "PO-55", payload.fetch("vendor_reference")
    assert_equal "Vendor confirmed ETA", payload.fetch("latest_follow_up_note")
  end

  test "manual work order without report time keeps SLA missing" do
    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Tamuning",
        region: "Central",
        description: "Dispatcher still needs the request timestamp",
        priority: "P3",
        status: "approved"
      }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body)
    assert_nil payload.fetch("reported_at")
    assert_nil payload.fetch("requested_at")
    assert_nil payload.fetch("sla_due_at")
    assert_equal "missing", payload.fetch("sla_status")
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

  test "shows a work order for route-based detail pages" do
    wo = work_order(title: "Detail drawer candidate", status: "waiting_for_parts")

    with_auth_env do
      get "/api/v1/work_orders/#{wo.id}", headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal wo.id, payload.fetch("id")
    assert_equal "Detail drawer candidate", payload.fetch("title")
    assert_equal "waiting_for_parts", payload.fetch("status")
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

  test "filters work orders by SLA status for quick queue pages" do
    overdue = work_order(title: "Overdue repair", priority: "P2", date: nil, reported_at: 2.days.ago)
    due_soon = work_order(title: "Due soon repair", priority: "P3", date: nil, reported_at: Time.current)
    due_soon.update_columns(assessment_due_at: Time.current + 2.hours, response_due_at: Time.current + 2.hours, repair_due_at: Time.current + 3.hours)
    missing = work_order(title: "Missing SLA data", priority: "P3", date: nil)

    with_auth_env do
      get "/api/v1/work_orders", params: { sla_status: "overdue" }, headers: auth_headers
    end

    assert_response :success
    assert_equal [ overdue.id ], JSON.parse(response.body).map { |item| item.fetch("id") }

    with_auth_env do
      get "/api/v1/work_orders", params: { sla_status: "due_soon" }, headers: auth_headers
    end

    assert_response :success
    assert_equal [ due_soon.id ], JSON.parse(response.body).map { |item| item.fetch("id") }

    with_auth_env do
      get "/api/v1/work_orders", params: { sla_status: "missing" }, headers: auth_headers
    end

    assert_response :success
    assert_equal [ missing.id ], JSON.parse(response.body).map { |item| item.fetch("id") }
  end

  test "filters open and closed queue pages" do
    open_order = work_order(title: "Open repair", status: "approved")
    completed_order = work_order(title: "Completed repair", status: "completed")
    cancelled_order = work_order(title: "Cancelled repair", status: "cancelled")

    with_auth_env do
      get "/api/v1/work_orders", params: { open: true }, headers: auth_headers
    end

    assert_response :success
    assert_equal [ open_order.id ], JSON.parse(response.body).map { |item| item.fetch("id") }

    with_auth_env do
      get "/api/v1/work_orders", params: { closed: true }, headers: auth_headers
    end

    assert_response :success
    assert_equal [ completed_order.id, cancelled_order.id ].sort, JSON.parse(response.body).map { |item| item.fetch("id") }.sort
  end

  test "paginated work order index returns metadata" do
    12.times { |index| work_order(title: "Paged work #{index}", date: DEFAULT_DATE + index.days) }

    with_auth_env do
      get "/api/v1/work_orders", params: { page: 1, per_page: 10, sort: "created_at", direction: "desc" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 10, payload.fetch("work_orders").size
    assert_equal 12, payload.dig("meta", "total_count")
    assert_equal 2, payload.dig("meta", "total_pages")
    assert_equal "created_at", payload.dig("meta", "sort")
    assert_equal "DESC", payload.dig("meta", "direction")
  end

  test "paginated PA project index returns full filtered sub counts" do
    12.times do |index|
      order = work_order(
        title: "PA project #{index}",
        status: index < 4 ? "waiting_for_parts" : "approved",
        date: DEFAULT_DATE + index.days
      )
      order.update!(pa_project: true, estimate_required: index.even?)
    end

    with_auth_env do
      get "/api/v1/work_orders", params: { pa_project: true, page: 1, per_page: 10, sort: "scheduled_date" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 10, payload.fetch("work_orders").size
    assert_equal 12, payload.dig("meta", "total_count")
    assert_equal 4, payload.dig("meta", "sub_counts", "waiting_for_parts")
    assert_equal 6, payload.dig("meta", "sub_counts", "estimate_required")
  end

  test "duplicate source and external id is rejected" do
    work_order(title: "Existing", status: "approved").update!(source: "mywork", external_id: "WO-123")

    with_auth_env do
      post "/api/v1/work_orders", params: {
        client: "Mobil",
        location: "Yigo",
        source: "mywork",
        external_id: "WO-123",
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
    assert_equal "dispatcher_work_orders_123", wo.status_events.order(:occurred_at, :id).last.user.clerk_id
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
