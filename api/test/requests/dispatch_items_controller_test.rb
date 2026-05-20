require "test_helper"

class DispatchItemsControllerTest < ActionDispatch::IntegrationTest
  test "updates crew and target order in one request" do
    source_team = team(name: "Source Crew", skills: [ "General" ])
    target_team = team(name: "Target Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    source_item = schedule.dispatch_items.create!(team: source_team, work_order: work_order(title: "Move me"), order_index: 0)
    target_first = schedule.dispatch_items.create!(team: target_team, work_order: work_order(title: "Target first"), order_index: 0)
    target_second = schedule.dispatch_items.create!(team: target_team, work_order: work_order(title: "Target second"), order_index: 1)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{source_item.id}", params: { team_id: target_team.id, order_index: 0 }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    moved = payload.fetch("items").find { |item| item.fetch("id") == source_item.id }
    assert_equal target_team.id, moved.fetch("team_id")
    assert_equal 0, moved.fetch("order_index")
    assert_equal [ 0, 1, 2 ], schedule.dispatch_items.where(team: target_team).reload.order(:order_index).pluck(:order_index)
    assert_equal [ 1, 2 ], [ target_first.reload.order_index, target_second.reload.order_index ]
  end

  test "does not update finalized schedule items" do
    assert_locked_schedule_item_is_not_updated("finalized")
  end

  test "does not update sent schedule items" do
    assert_locked_schedule_item_is_not_updated("sent")
  end

  test "rolls back item update when audit event cannot be recorded" do
    crew = team(name: "Audit Item Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Audit item work"), order_index: 0, notes: "Original")

    invalid_event = AuditEvent.new
    original_record = AuditEvent.method(:record!)
    begin
      AuditEvent.define_singleton_method(:record!) { |**| raise ActiveRecord::RecordInvalid.new(invalid_event) }
      with_auth_env do
        patch "/api/v1/dispatch_items/#{item.id}", params: { notes: "Changed" }, headers: auth_headers
      end
    ensure
      AuditEvent.define_singleton_method(:record!, original_record)
    end

    assert_response :unprocessable_entity
    assert_equal "Original", item.reload.notes
  end

  test "records carry over outcome and keeps work order eligible" do
    crew = team(name: "Carry Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    wo = work_order(title: "Carry work", status: "scheduled")
    item = schedule.dispatch_items.create!(team: crew, work_order: wo, order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "carry_over", outcome_notes: "Need cartridge", carried_over_to_date: (DEFAULT_DATE + 1.day).to_s }, headers: auth_headers
    end

    assert_response :success
    assert_equal "carry_over", item.reload.outcome_status
    assert_equal DEFAULT_DATE + 1.day, item.carried_over_to_date
    assert_equal "carry_over", wo.reload.status
    assert_equal DEFAULT_DATE + 1.day, wo.scheduled_date
    assert_equal "dispatch_item.outcome_updated", AuditEvent.last.action
  end

  test "records completed outcome and closes work order" do
    crew = team(name: "Complete Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    wo = work_order(title: "Complete work", status: "scheduled")
    item = schedule.dispatch_items.create!(team: crew, work_order: wo, order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "completed", outcome_notes: "Done" }, headers: auth_headers
    end

    assert_response :success
    assert_equal "completed", item.reload.outcome_status
    assert_not_nil item.completed_at
    assert_equal "completed", wo.reload.status
  end

  test "viewer cannot update dispatch outcome" do
    crew = team(name: "Outcome Locked", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    item = schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Viewer outcome"), order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "completed" }, headers: viewer_auth_headers
    end

    assert_response :forbidden
    assert_equal "pending", item.reload.outcome_status
  end

  test "records reassignment audit metadata" do
    source_team = team(name: "Original Crew", skills: [ "General" ])
    target_team = team(name: "New Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: source_team, work_order: work_order(title: "Reassign work"), order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}", params: { team_id: target_team.id, reassignment_reason: "Call-out" }, headers: auth_headers
    end

    assert_response :success
    assert_equal "dispatch_item.reassigned", AuditEvent.last.action
    assert_equal "Original Crew", AuditEvent.last.metadata_hash.fetch("previous_team")
    assert_equal "New Crew", AuditEvent.last.metadata_hash.fetch("new_team")
    assert_equal "Call-out", AuditEvent.last.metadata_hash.fetch("reassignment_reason")
  end

  test "clears scheduled time when blank string is provided" do
    crew = team(name: "Time Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Timed work"), order_index: 0, scheduled_time: "08:00")

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}", params: { scheduled_time: "" }, headers: auth_headers
    end

    assert_response :success
    assert_nil item.reload.scheduled_time
  end

  private

  def assert_locked_schedule_item_is_not_updated(status)
    crew = team(name: "Locked #{status} Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: status)
    item = schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Locked #{status} work"), order_index: 0, notes: "Original")

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}", params: { notes: "Changed" }, headers: auth_headers
    end

    assert_response :conflict
    assert_equal "Original", item.reload.notes
  end

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers
    User.find_or_create_by!(clerk_id: "dispatcher_123") do |user|
      user.email = "dispatcher@example.com"
      user.role = "dispatcher"
    end
    { "Authorization" => "Bearer test_token:dispatcher_123:dispatcher@example.com" }
  end

  def viewer_auth_headers
    User.find_or_create_by!(clerk_id: "viewer_123") do |user|
      user.email = "viewer@example.com"
      user.role = "viewer"
    end
    { "Authorization" => "Bearer test_token:viewer_123:viewer@example.com" }
  end
end
