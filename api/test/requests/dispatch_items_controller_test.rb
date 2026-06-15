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

  test "custom technician ids update stop snapshot without changing the whole crew" do
    crew = team(name: "Crew With Helper", skills: [ "General" ])
    driver = crew.technicians.first
    helper = Technician.create!(name: "Special Helper", primary_trade: "Electrical", is_driver: false, active: true)
    other_team = team(name: "Other Crew", skills: [ "HVAC" ])
    other_tech = other_team.technicians.first
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Needs helper"), order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}", params: { technician_ids: [ helper.id, driver.id ], reassignment_reason: "Needs second tech" }, headers: auth_headers
    end

    assert_response :success
    item.reload
    assert_equal crew.id, item.team_id
    assert_equal [ helper.id, driver.id ], item.dispatch_item_technicians.order(:position).pluck(:technician_id)
    assert_empty item.dispatch_item_technicians.where(technician_id: other_tech.id)
    assert_equal "dispatch_item.reassigned", AuditEvent.last.action
    assert_equal [ helper.id, driver.id ], AuditEvent.last.metadata_hash.fetch("technician_ids")
  end

  test "rejects inactive custom technician ids" do
    crew = team(name: "Crew Active", skills: [ "General" ])
    inactive = Technician.create!(name: "Inactive Helper", primary_trade: "General", is_driver: false, active: false)
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Bad helper"), order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}", params: { technician_ids: [ inactive.id ] }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_empty item.reload.dispatch_item_technicians
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

  test "completed PM dispatch outcome marks PM task completed" do
    crew = team(name: "PM Outcome Crew")
    pm = pm_task(task_name: "Outcome PM", date: DEFAULT_DATE)
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    item = schedule.dispatch_items.create!(pm_task: pm, team: crew, order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "completed", outcome_notes: "PM done" }, headers: auth_headers
    end

    assert_response :success
    assert_equal "completed", pm.reload.status
    assert_not_nil pm.completed_at
  end

  test "carry-over PM dispatch outcome defers PM task" do
    crew = team(name: "PM Carry Crew")
    pm = pm_task(task_name: "Deferred PM", date: DEFAULT_DATE)
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    item = schedule.dispatch_items.create!(pm_task: pm, team: crew, order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "carry_over", carried_over_to_date: (DEFAULT_DATE + 2.days).to_s }, headers: auth_headers
    end

    assert_response :success
    assert_equal "deferred", pm.reload.status
    assert_equal DEFAULT_DATE + 2.days, pm.deferred_until
  end

  test "non-lifecycle PM dispatch outcomes leave PM status metadata unchanged" do
    crew = team(name: "PM Waiting Crew")
    pm = pm_task(task_name: "Waiting PM", date: DEFAULT_DATE)
    pm.update!(status: "scheduled")
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    item = schedule.dispatch_items.create!(pm_task: pm, team: crew, order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "waiting_parts", outcome_notes: "Need filter" }, headers: auth_headers
    end

    assert_response :success
    assert_equal "waiting_parts", item.reload.outcome_status
    assert_equal "scheduled", pm.reload.status
    assert_nil pm.completed_at
    assert_nil pm.deferred_until
  end

  test "resetting outcome to pending restores scheduled work order state" do
    crew = team(name: "Reset Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    wo = work_order(title: "Reset work", status: "scheduled")
    item = schedule.dispatch_items.create!(team: crew, work_order: wo, order_index: 0, outcome_status: "carry_over", carried_over_to_date: DEFAULT_DATE + 1.day)
    wo.update!(status: "carry_over", scheduled_date: DEFAULT_DATE + 1.day)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}/outcome", params: { outcome_status: "pending" }, headers: auth_headers
    end

    assert_response :success
    assert_equal "pending", item.reload.outcome_status
    assert_nil item.carried_over_to_date
    assert_equal "scheduled", wo.reload.status
    assert_equal DEFAULT_DATE, wo.scheduled_date
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

  test "rolls back reassignment when technician snapshot fails" do
    source_team = team(name: "Stable Crew", skills: [ "General" ])
    target_team = team(name: "Invalid Snapshot Crew", skills: [ "General" ])
    target_team.team_memberships.create!(technician: Technician.create!(name: nil, primary_trade: "General", is_driver: false, active: true))
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: source_team, work_order: work_order(title: "Atomic reassign work"), order_index: 0)

    with_auth_env do
      patch "/api/v1/dispatch_items/#{item.id}", params: { team_id: target_team.id, reassignment_reason: "Bad roster" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal source_team.id, item.reload.team_id
    assert_empty item.dispatch_item_technicians.reload
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
