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

  test "dispatcher updates PM task workflow status" do
    pm = pm_task(task_name: "Station PM", date: DEFAULT_DATE)

    with_auth_env do
      patch "/api/v1/pm_tasks/#{pm.id}", params: { status: "completed", notes: "Completed with station visit" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "completed", payload.fetch("status")
    assert_not_nil payload.fetch("completed_at")
    assert_equal "Completed with station visit", payload.fetch("notes")
    assert_equal "pm_task.updated", AuditEvent.last.action
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
