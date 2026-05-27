require "test_helper"

class AuthenticationTest < ActionDispatch::IntegrationTest
  test "api requires Clerk configuration" do
    with_auth_env({}) do
      get "/api/v1/me"

      assert_response :service_unavailable
      assert_equal [ "Clerk authentication is not configured" ], JSON.parse(response.body).fetch("errors")
    end
  end

  test "configured Clerk auth rejects anonymous API requests" do
    with_auth_env("CLERK_JWKS_URL" => "https://clerk.example.test/.well-known/jwks.json") do
      get "/api/v1/dashboard"

      assert_response :unauthorized
      assert_includes JSON.parse(response.body).fetch("errors"), "Missing bearer token"
    end
  end

  test "viewer can read but cannot mutate dispatch data" do
    with_auth_env("CLERK_JWKS_URL" => "https://clerk.example.test/.well-known/jwks.json") do
      crew = team(name: "Viewer Test Crew")
      User.create!(clerk_id: "pending_viewer", email: "viewer@example.com", role: "viewer", invitation_status: "pending")

      get "/api/v1/dashboard", headers: auth_headers("viewer_123", "viewer@example.com")
      assert_response :success

      patch "/api/v1/technicians/#{crew.technicians.first.id}", params: { date: DEFAULT_DATE, availability: "unavailable" }, headers: auth_headers("viewer_123", "viewer@example.com")
      assert_response :forbidden
    end
  end

  test "dispatcher can mutate dispatch data from persisted user role" do
    with_auth_env("CLERK_JWKS_URL" => "https://clerk.example.test/.well-known/jwks.json") do
      crew = team(name: "Dispatcher Test Crew")
      User.create!(clerk_id: "dispatcher_123", email: "dispatcher@example.com", role: "dispatcher")

      patch "/api/v1/technicians/#{crew.technicians.first.id}", params: { date: DEFAULT_DATE, availability: "unavailable" }, headers: auth_headers("dispatcher_123", "dispatcher@example.com")

      assert_response :success
      assert_equal "unavailable", crew.technicians.first.technician_availabilities.find_by(date: DEFAULT_DATE).status
    end
  end

  test "bootstrap admin env promotes matching user on sign in" do
    with_auth_env(
      "CLERK_JWKS_URL" => "https://clerk.example.test/.well-known/jwks.json",
      "CLERK_BOOTSTRAP_ADMIN_EMAILS" => "owner@example.com"
    ) do
      user = User.create!(clerk_id: "owner_123", email: "owner@example.com", role: "viewer")

      get "/api/v1/me", headers: auth_headers("owner_123", "owner@example.com")

      assert_response :success
      assert_equal "admin", user.reload.role
      assert_equal "admin", JSON.parse(response.body).dig("user", "role")
    end
  end

  test "uninvited non-bootstrap Clerk users are rejected" do
    with_auth_env("CLERK_JWKS_URL" => "https://clerk.example.test/.well-known/jwks.json") do
      get "/api/v1/me", headers: auth_headers("new_viewer_123", "new-viewer@example.com")

      assert_response :forbidden
      assert_includes JSON.parse(response.body).fetch("errors").first, "has not been invited"
      assert_nil User.find_by(clerk_id: "new_viewer_123")
    end
  end

  test "persisted non-bootstrap role is not reset by auth env on sign in" do
    with_auth_env("CLERK_JWKS_URL" => "https://clerk.example.test/.well-known/jwks.json") do
      user = User.create!(clerk_id: "dispatcher_456", email: "dispatcher456@example.com", role: "dispatcher")

      get "/api/v1/me", headers: auth_headers("dispatcher_456", "dispatcher456@example.com")

      assert_response :success
      assert_equal "dispatcher", user.reload.role
      assert_equal "dispatcher", JSON.parse(response.body).dig("user", "role")
    end
  end

  test "auth sync constraint errors return structured json" do
    with_auth_env("CLERK_JWKS_URL" => "https://clerk.example.test/.well-known/jwks.json") do
      with_user_sync_error(ActiveRecord::RecordNotUnique.new("collision")) do
        get "/api/v1/me", headers: auth_headers("collision_123", "collision@example.com")
      end

      assert_response :conflict
      assert_equal [ "Unable to sync authenticated user. Please retry." ], JSON.parse(response.body).fetch("errors")
    end
  end

  private

  AUTH_ENV_KEYS = %w[CLERK_JWKS_URL CLERK_DOMAIN CLERK_SECRET_KEY CLERK_BOOTSTRAP_ADMIN_EMAILS].freeze

  def with_auth_env(values)
    previous = AUTH_ENV_KEYS.to_h { |key| [ key, ENV[key] ] }
    AUTH_ENV_KEYS.each { |key| ENV.delete(key) }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each do |key, value|
      value.nil? ? ENV.delete(key) : ENV[key] = value
    end
  end

  def auth_headers(clerk_id, email)
    { "Authorization" => "Bearer test_token:#{clerk_id}:#{email}" }
  end

  def with_user_sync_error(error)
    original = Auth::UserSync.method(:call)
    Auth::UserSync.define_singleton_method(:call) { |_payload| raise error }
    yield
  ensure
    Auth::UserSync.define_singleton_method(:call) { |payload| original.call(payload) }
  end
end
