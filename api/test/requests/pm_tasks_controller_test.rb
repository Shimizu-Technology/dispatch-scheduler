require "test_helper"

class PmTasksControllerTest < ActionDispatch::IntegrationTest
  test "lists PM tasks by month and status" do
    current = pm_task(task_name: "Current PM", date: DEFAULT_DATE)
    pm_task(task_name: "Next month PM", date: DEFAULT_DATE.next_month)
    pm_task(task_name: "Completed PM", date: DEFAULT_DATE).update!(status: "completed", completed_at: Time.current)

    with_auth_env do
      get "/api/v1/pm_tasks", params: { month: DEFAULT_DATE.strftime("%Y-%m"), status: "pending" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal [ current.id ], payload.map { |item| item.fetch("id") }
  end

  test "dispatcher creates a manual PM task" do
    payload = {
      client: "Mobil",
      location: "Yona Mobil",
      region: "South",
      task_name: "Monthly electrical PM",
      trade_category: "Electrical",
      scheduled_date: DEFAULT_DATE.to_s,
      notes: "June setup"
    }

    with_auth_env do
      post "/api/v1/pm_tasks", params: payload, headers: auth_headers
    end

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal "Yona Mobil", body.fetch("location")
    assert_equal "pending", body.fetch("status")
    assert_equal "pm_task.created", AuditEvent.last.action
  end

  test "dispatcher bulk creates PM month rows and skips duplicates" do
    pm_task(task_name: "Existing PM", date: DEFAULT_DATE)

    rows = [
      { client: "Mobil", location: "Yigo North", region: "North", task_name: "Existing PM", trade_category: "General", scheduled_date: DEFAULT_DATE.to_s },
      { client: "Mobil", location: "Agat Mobil", region: "South", task_name: "Water systems PM", trade_category: "Plumbing", scheduled_date: DEFAULT_DATE.to_s }
    ]

    with_auth_env do
      post "/api/v1/pm_tasks/bulk_create", params: { pm_tasks: rows }, headers: auth_headers
    end

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal 1, body.fetch("summary").fetch("created_count")
    assert_equal 1, body.fetch("summary").fetch("duplicate_count")
    assert_equal "Water systems PM", body.fetch("created").first.fetch("task_name")
  end

  test "bulk PM setup reuses and normalizes existing locations with trailing spaces" do
    dirty_location = location(name: "Yona Mobil ", region: "South")

    with_auth_env do
      post "/api/v1/pm_tasks/bulk_create", params: { pm_tasks: [
        { client: "Mobil", location: "Yona Mobil", region: "South", task_name: "Same-location PM", trade_category: "General", scheduled_date: DEFAULT_DATE.to_s }
      ] }, headers: auth_headers
    end

    assert_response :created
    pm = PmTask.find(JSON.parse(response.body).fetch("created").first.fetch("id"))
    assert_equal dirty_location.id, pm.location_id
    assert_equal "Yona Mobil", dirty_location.reload.name
  end

  test "bulk duplicate rows do not overwrite existing location region" do
    existing_location = location(name: "Yigo North", region: "North")
    pm_task(task_name: "Existing PM", date: DEFAULT_DATE, location_record: existing_location)

    with_auth_env do
      post "/api/v1/pm_tasks/bulk_create", params: { pm_tasks: [
        { client: "Mobil", location: "Yigo North", region: "Typo Region", task_name: "Existing PM", trade_category: "General", scheduled_date: DEFAULT_DATE.to_s }
      ] }, headers: auth_headers
    end

    assert_response :created
    assert_equal "North", existing_location.reload.region
    assert_equal 1, JSON.parse(response.body).fetch("summary").fetch("duplicate_count")
  end

  test "viewer cannot create PM task" do
    with_auth_env do
      post "/api/v1/pm_tasks", params: { location: "Yigo North", task_name: "PM", scheduled_date: DEFAULT_DATE.to_s }, headers: auth_headers("viewer_pm_create_123", "viewer-pm-create@example.com", "viewer")
    end

    assert_response :forbidden
  end

  test "dispatcher updates PM task workflow status and JCF time" do
    pm = pm_task(task_name: "Station PM", date: DEFAULT_DATE)

    with_auth_env do
      patch "/api/v1/pm_tasks/#{pm.id}", params: { status: "completed", notes: "Completed with station visit", time_in_at: "2026-05-05T08:00:00+10:00", time_out_at: "2026-05-05T09:30:00+10:00" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "completed", payload.fetch("status")
    assert_not_nil payload.fetch("completed_at")
    assert_equal "Completed with station visit", payload.fetch("notes")
    assert_equal "2026-05-05T08:00:00+10:00", payload.fetch("time_in_at")
    assert_equal "2026-05-05T09:30:00+10:00", payload.fetch("time_out_at")
    assert_equal 90, payload.fetch("actual_duration_minutes")
    assert_equal "pm_task.updated", AuditEvent.last.action
  end

  test "dispatcher cannot save PM time out before time in" do
    pm = pm_task(task_name: "Backwards JCF PM", date: DEFAULT_DATE)

    with_auth_env do
      patch "/api/v1/pm_tasks/#{pm.id}", params: { time_in_at: "2026-05-05T09:00:00+10:00", time_out_at: "2026-05-05T08:00:00+10:00" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body).fetch("errors").join(", "), "Time out at can't be before time in"
    assert_nil pm.reload.time_in_at
  end

  test "dispatcher completes a station checklist atomically" do
    first = pm_task(task_name: "Station Electrical", date: DEFAULT_DATE)
    second = pm_task(task_name: "Station Plumbing", date: DEFAULT_DATE)

    with_auth_env do
      post "/api/v1/pm_tasks/bulk_complete", params: { pm_task_ids: [ first.id, second.id ], time_in_at: "2026-05-05T08:00:00+10:00", time_out_at: "2026-05-05T10:15:00+10:00" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal [ "completed", "completed" ], payload.fetch("pm_tasks").map { |pm| pm.fetch("status") }
    assert_equal [ 135, 135 ], payload.fetch("pm_tasks").map { |pm| pm.fetch("actual_duration_minutes") }
    assert_equal [ "completed", "completed" ], [ first.reload.status, second.reload.status ]
    assert_equal [ Time.zone.parse("2026-05-05T08:00:00+10:00"), Time.zone.parse("2026-05-05T08:00:00+10:00") ], [ first.time_in_at, second.time_in_at ]
    assert_equal 2, AuditEvent.where(action: "pm_task.updated").count
    assert_equal "station_completion", AuditEvent.last.metadata_hash.fetch("source")
  end

  test "station checklist completion rejects invalid JCF time without partial updates" do
    first = pm_task(task_name: "Station Electrical", date: DEFAULT_DATE)
    second = pm_task(task_name: "Station Plumbing", date: DEFAULT_DATE)

    with_auth_env do
      post "/api/v1/pm_tasks/bulk_complete", params: { pm_task_ids: [ first.id, second.id ], time_in_at: "2026-05-05T10:00:00+10:00", time_out_at: "2026-05-05T08:00:00+10:00" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal [ "pending", "pending" ], [ first.reload.status, second.reload.status ]
    assert_nil first.time_in_at
  end

  test "station checklist completion rejects missing PM tasks without partial updates" do
    first = pm_task(task_name: "Station Electrical", date: DEFAULT_DATE)

    with_auth_env do
      post "/api/v1/pm_tasks/bulk_complete", params: { pm_task_ids: [ first.id, 99_999 ] }, headers: auth_headers
    end

    assert_response :not_found
    assert_equal "pending", first.reload.status
  end

  test "deferred PM update requires deferred until date" do
    pm = pm_task(task_name: "Missing defer date PM", date: DEFAULT_DATE)

    with_auth_env do
      patch "/api/v1/pm_tasks/#{pm.id}", params: { status: "deferred" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body).fetch("errors").join(", "), "Deferred until can't be blank"
    assert_equal "pending", pm.reload.status
  end

  test "viewer cannot update PM task" do
    pm = pm_task(task_name: "Read only PM", date: DEFAULT_DATE)

    with_auth_env do
      patch "/api/v1/pm_tasks/#{pm.id}", params: { status: "completed" }, headers: auth_headers("viewer_pm_123", "viewer-pm@example.com", "viewer")
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

  def auth_headers(clerk_id = "dispatcher_pm_123", email = "dispatcher-pm@example.com", role = "dispatcher")
    User.find_or_create_by!(clerk_id: clerk_id) do |user|
      user.email = email
      user.role = role
    end
    { "Authorization" => "Bearer test_token:#{clerk_id}:#{email}" }
  end
end
