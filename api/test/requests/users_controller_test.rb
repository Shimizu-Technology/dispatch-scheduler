require "test_helper"

class UsersControllerTest < ActionDispatch::IntegrationTest
  test "admin can list users" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", name: "Admin User", role: "admin")
      User.create!(clerk_id: "viewer_123", email: "viewer@example.com", name: "Viewer User", role: "viewer")

      get "/api/v1/users", headers: auth_headers(admin)

      assert_response :success
      users = JSON.parse(response.body).fetch("users")
      assert_equal [ "admin@example.com", "viewer@example.com" ], users.map { |user| user.fetch("email") }
    end
  end

  test "admin can update a user role" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      viewer = User.create!(clerk_id: "viewer_123", email: "viewer@example.com", role: "viewer")

      patch "/api/v1/users/#{viewer.id}", params: { role: "dispatcher" }, headers: auth_headers(admin)

      assert_response :success
      assert_equal "dispatcher", viewer.reload.role
      assert_equal "dispatcher", JSON.parse(response.body).dig("user", "role")
    end
  end

  test "viewer cannot manage users" do
    with_auth_env do
      viewer = User.create!(clerk_id: "viewer_123", email: "viewer@example.com", role: "viewer")

      get "/api/v1/users", headers: auth_headers(viewer)

      assert_response :forbidden
    end
  end

  test "cannot remove the last admin" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")

      patch "/api/v1/users/#{admin.id}", params: { role: "viewer" }, headers: auth_headers(admin)

      assert_response :unprocessable_entity
      assert_equal "admin", admin.reload.role
      assert_equal [ "At least one admin is required" ], JSON.parse(response.body).fetch("errors")
    end
  end

  private

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers(user)
    { "Authorization" => "Bearer test_token:#{user.clerk_id}:#{user.email}" }
  end
end
