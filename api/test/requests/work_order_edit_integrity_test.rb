require "test_helper"

class WorkOrderEditIntegrityTest < ActionDispatch::IntegrationTest
  setup do
    @previous_jwks = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    User.create!(clerk_id: "edit_integrity", email: "edit-integrity@example.com", role: "dispatcher")
    @headers = { "Authorization" => "Bearer test_token:edit_integrity:edit-integrity@example.com" }
  end

  teardown do
    @previous_jwks.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = @previous_jwks
  end

  test "a description edit preserves a distinct original request timestamp" do
    wo = work_order(reported_at: Time.zone.parse("2026-10-10T09:00:41.456789+10:00"))
    original = Time.zone.parse("2026-10-10T08:15:32.123456+10:00")
    wo.update!(requested_at: original)
    patch "/api/v1/work_orders/#{wo.id}", params: { description: "Notes-only edit", expected_lock_version: wo.lock_version }, headers: @headers
    assert_response :success
    assert_equal original, wo.reload.requested_at
  end

  test "two full editors cannot overwrite each others unrelated changes" do
    wo = work_order(title: "Original")
    wo.update!(notes: "Original note")
    revision = wo.lock_version
    snapshot = { client: wo.client.name, location: wo.location.name, source: wo.source, external_id: wo.external_id, description: wo.description, status: wo.status, notes: wo.notes }
    patch "/api/v1/work_orders/#{wo.id}", params: snapshot.merge(notes: "Vendor confirmed", expected_lock_version: revision), headers: @headers
    assert_response :success
    patch "/api/v1/work_orders/#{wo.id}", params: snapshot.merge(description: "Edited scope", expected_lock_version: revision), headers: @headers
    assert_response :conflict
    assert_equal "Vendor confirmed", wo.reload.notes
    assert_equal "Original", wo.description
    conflict = JSON.parse(response.body)
    assert_equal "stale_work_order", conflict.fetch("code")
    assert_equal [ "This work order changed while you were editing. Review the latest version before saving again." ], conflict.fetch("errors")
    latest = conflict.fetch("latest_work_order")
    assert_equal "Vendor confirmed", latest.fetch("notes")
    assert_equal wo.lock_version, latest.fetch("lock_version")
    patch "/api/v1/work_orders/#{wo.id}", params: snapshot.merge(description: "Edited scope", notes: latest.fetch("notes"), expected_lock_version: latest.fetch("lock_version")), headers: @headers
    assert_response :success
    assert_equal "Edited scope", wo.reload.description
    assert_equal "Vendor confirmed", wo.notes
  end
  test "legacy callers without revision retain last writer compatibility" do
    wo = work_order
    patch "/api/v1/work_orders/#{wo.id}", params: { notes: "First writer" }, headers: @headers
    assert_response :success
    first_version = JSON.parse(response.body).fetch("lock_version")
    patch "/api/v1/work_orders/#{wo.id}", params: { notes: "Last writer" }, headers: @headers
    assert_response :success
    assert_equal "Last writer", wo.reload.notes
    assert_equal first_version + 1, wo.lock_version
  end

  test "stale edit is rejected before creating clients locations or audits" do
    wo = work_order
    original_version = wo.lock_version
    wo.update!(notes: "Newer")
    audits = AuditEvent.count
    patch "/api/v1/work_orders/#{wo.id}", params: { expected_lock_version: original_version, client: "Stale client", location: "Stale site", description: "Stale text" }, headers: @headers
    assert_response :conflict
    assert_nil Client.find_by(name: "Stale client")
    assert_nil Location.find_by(name: "Stale site")
    assert_equal audits, AuditEvent.count
    assert_equal "Newer", wo.reload.notes
  end

  test "invalid revision is rejected without write and create cannot set revision" do
    wo = work_order
    [ nil, -1, 0.5, "1.0", "invalid" ].each do |revision|
      patch "/api/v1/work_orders/#{wo.id}", params: { expected_lock_version: revision, notes: "Must not save" }, as: :json, headers: @headers
      assert_response :unprocessable_entity
      assert_nil wo.reload.notes
      assert_equal 0, wo.lock_version
    end
    post "/api/v1/work_orders", params: { client: "Synthetic", location: "New site", description: "New", lock_version: 999, expected_lock_version: 999 }, headers: @headers
    assert_response :created
    assert_equal 0, JSON.parse(response.body).fetch("lock_version")
  end

  test "failed validation or audit preserves saved revision and edit values" do
    wo = work_order
    patch "/api/v1/work_orders/#{wo.id}", params: { expected_lock_version: 0, status: "bad", client: "Rollback client", location: "Rollback site" }, headers: @headers
    assert_response :unprocessable_entity
    assert_equal 0, wo.reload.lock_version
    assert_nil Client.find_by(name: "Rollback client")
    original = AuditEvent.method(:record!)
    begin
      AuditEvent.define_singleton_method(:record!) { |**| raise ActiveRecord::RecordInvalid.new(AuditEvent.new) }
      patch "/api/v1/work_orders/#{wo.id}", params: { expected_lock_version: 0, notes: "Must roll back" }, headers: @headers
    ensure
      AuditEvent.define_singleton_method(:record!, original)
    end
    assert_response :unprocessable_entity
    assert_nil wo.reload.notes
    assert_equal 0, wo.lock_version
  end

  test "viewer update is forbidden without revealing latest conflict payload" do
    wo = work_order
    User.create!(clerk_id: "edit_viewer", email: "edit-viewer@example.com", role: "viewer")
    viewer = { "Authorization" => "Bearer test_token:edit_viewer:edit-viewer@example.com" }
    patch "/api/v1/work_orders/#{wo.id}", params: { expected_lock_version: 999, notes: "Denied" }, headers: viewer
    assert_response :forbidden
    assert_not JSON.parse(response.body).key?("latest_work_order")
    assert_equal 0, wo.reload.lock_version
  end

  test "status archive and dispatch transitions advance editor revisions" do
    wo = work_order
    patch "/api/v1/work_orders/#{wo.id}/status", params: { status: "in_progress" }, headers: @headers
    assert_response :success
    assert_equal 1, wo.reload.lock_version
    patch "/api/v1/work_orders/#{wo.id}/archive", headers: @headers
    assert_response :success
    assert_equal 2, wo.reload.lock_version
    patch "/api/v1/work_orders/#{wo.id}/unarchive", headers: @headers
    assert_response :success
    assert_equal 3, wo.reload.lock_version
    crew = team
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: crew, work_order: wo, order_index: 0, scheduled_time: "08:00")
    post "/api/v1/dispatch_schedules/#{schedule.id}/finalize", headers: @headers
    assert_response :success
    assert_equal 4, wo.reload.lock_version
    post "/api/v1/dispatch_schedules/#{schedule.id}/mark_sent", headers: @headers
    assert_response :success
    assert_equal 5, wo.reload.lock_version
    patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "completed" }, headers: @headers
    assert_response :success
    assert_equal 6, wo.reload.lock_version
    patch "/api/v1/work_orders/#{wo.id}", params: { expected_lock_version: 0, status: "approved" }, headers: @headers
    assert_response :conflict
    assert_equal "completed", JSON.parse(response.body).fetch("latest_work_order").fetch("status")
  end
end
