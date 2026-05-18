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
end
