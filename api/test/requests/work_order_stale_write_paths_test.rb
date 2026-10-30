require "test_helper"

class WorkOrderStaleWritePathsTest < ActionDispatch::IntegrationTest
  setup do
    @previous_jwks = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    user = User.create!(clerk_id: "stale_paths", email: "stale-paths@example.com", role: "dispatcher")
    @headers = { "Authorization" => "Bearer test_token:#{user.clerk_id}:#{user.email}" }
  end

  teardown do
    @previous_jwks.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = @previous_jwks
  end

  { "update" => { description: "Must not save" }, "status" => { status: "completed" }, "archive" => {}, "unarchive" => {} }.each do |action, attrs|
    test "#{action} returns the latest work order for a stale instance without partial writes" do
      order = work_order(status: "approved")
      order.update!(archived_at: Time.current) if action == "unarchive"
      original = order.attributes
      revision = order.lock_version
      order.update!(notes: "Concurrent edit")
      assert_no_difference("AuditEvent.count") do
        with_stale_update(order.id, revision) do
          suffix = action == "update" ? "" : "/#{action}"
          patch "/api/v1/work_orders/#{order.id}#{suffix}", params: attrs, headers: @headers
        end
      end
      assert_conflict(order)
      assert_equal original["status"], order.status
      original["archived_at"] ? assert_equal(original["archived_at"], order.archived_at) : assert_nil(order.archived_at)
      assert_equal original["description"], order.description
    end
  end

  %w[finalize mark_sent reopen].each do |action|
    test "dispatch #{action} rolls back the whole transition on a stale work order" do
      order = work_order(status: action == "finalize" ? "approved" : "scheduled")
      schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: action == "finalize" ? "draft" : "finalized")
      item = schedule.dispatch_items.create!(team: team, work_order: order, order_index: 0,
        previous_work_order_status: action == "reopen" ? "approved" : nil,
        auto_work_order_status: action == "reopen" ? "scheduled" : nil)
      schedule_before = schedule.attributes
      item_before = item.attributes
      revision = order.lock_version
      order.update!(notes: "Concurrent edit")
      assert_no_difference([ "AuditEvent.count", "DispatchItemTechnician.count" ]) do
        with_stale_update(order.id, revision) do
          post "/api/v1/dispatch_schedules/#{schedule.id}/#{action}", headers: @headers
        end
      end
      assert_conflict(order)
      assert_equal schedule_before, schedule.reload.attributes
      assert_equal item_before, item.reload.attributes
    end
  end

  DispatchItem::OUTCOME_STATUSES.each do |outcome|
    test "dispatch outcome #{outcome} rolls back on a stale work order" do
      order = work_order(status: "scheduled")
      schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
      item = schedule.dispatch_items.create!(team: team, work_order: order, order_index: 0)
      item_before = item.attributes
      revision = order.lock_version
      order.update!(notes: "Concurrent edit")
      assert_no_difference("AuditEvent.count") do
        with_stale_update(order.id, revision) do
          patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: outcome, outcome_notes: "Must roll back", carried_over_to_date: DEFAULT_DATE.next_day.to_s }, headers: @headers
        end
      end
      assert_conflict(order)
      assert_equal "scheduled", order.status
      assert_equal item_before, item.reload.attributes
    end
  end

  private

  # Inject the old revision after any with_lock reload so the real optimistic
  # UPDATE raises, without mocking the exception or the transaction rollback.
  def with_stale_update(id, revision)
    original = WorkOrder.instance_method(:update!)
    injected = false
    WorkOrder.define_method(:update!) do |attributes|
      if self.id == id && !injected
        self.lock_version = revision
        injected = true
      end
      original.bind_call(self, attributes)
    end
    yield
    assert injected, "Request did not reach the WorkOrder write"
  ensure
    WorkOrder.define_method(:update!, original)
  end

  def assert_conflict(order)
    assert_response :conflict
    body = JSON.parse(response.body)
    assert_equal "stale_work_order", body.fetch("code")
    assert_equal [ "This work order changed while you were editing. Review the latest version before saving again." ], body.fetch("errors")
    assert_equal "Concurrent edit", body.fetch("latest_work_order").fetch("notes")
    assert_equal order.reload.lock_version, body.fetch("latest_work_order").fetch("lock_version")
    assert_equal "Concurrent edit", order.notes
  end
end
