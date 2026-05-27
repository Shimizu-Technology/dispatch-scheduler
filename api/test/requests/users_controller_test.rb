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

  test "admin can invite a user" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")

      post "/api/v1/users", params: { email: "dispatcher@example.com", name: "Dispatch Lead", role: "dispatcher" }, headers: auth_headers(admin)

      assert_response :created
      payload = JSON.parse(response.body)
      assert_equal "dispatcher@example.com", payload.dig("user", "email")
      assert_equal "pending", payload.dig("user", "invitation_status")
      assert_equal false, payload.fetch("invitation_sent")
      assert_equal "CLERK_SECRET_KEY is not configured", payload.fetch("invitation_error")

      invited = User.find_by!(email: "dispatcher@example.com")
      assert_equal "pending", invited.invitation_status
      assert_match(/\Apending_/, invited.clerk_id)
      assert_equal admin, invited.invited_by
      assert_equal "user.invited", AuditEvent.last.action
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

  test "active cannot be set to nil" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      viewer = User.create!(clerk_id: "viewer_123", email: "viewer@example.com", role: "viewer")

      patch "/api/v1/users/#{viewer.id}", params: { active: nil }, headers: auth_headers(admin)

      assert_response :unprocessable_entity
      assert_equal [ "Active must be true or false" ], JSON.parse(response.body).fetch("errors")
      assert_equal true, viewer.reload.active?
    end
  end

  test "admin can deactivate and delete invited user" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      invited = User.create!(clerk_id: "pending_123", email: "pending@example.com", role: "viewer", invitation_status: "pending")

      patch "/api/v1/users/#{invited.id}", params: { active: false }, headers: auth_headers(admin)

      assert_response :success
      assert_equal false, invited.reload.active?

      delete "/api/v1/users/#{invited.id}", headers: auth_headers(admin)

      assert_response :no_content
      assert_nil User.find_by(id: invited.id)
    end
  end

  test "cannot deactivate the last active admin" do
    with_auth_env do
      last_active_admin = User.create!(clerk_id: "last_active_admin_123", email: "last-active-admin@example.com", role: "admin")
      User.create!(clerk_id: "inactive_admin_123", email: "inactive-admin@example.com", role: "admin", active: false)

      patch "/api/v1/users/#{last_active_admin.id}", params: { active: false }, headers: auth_headers(last_active_admin)

      assert_response :unprocessable_entity
      assert_equal true, last_active_admin.reload.active?
      assert_equal [ "At least one admin is required" ], JSON.parse(response.body).fetch("errors")
    end
  end

  test "cannot demote the last active admin when other admins are inactive" do
    with_auth_env do
      last_active_admin = User.create!(clerk_id: "last_active_admin_123", email: "last-active-admin@example.com", role: "admin")
      User.create!(clerk_id: "inactive_admin_123", email: "inactive-admin@example.com", role: "admin", active: false)

      patch "/api/v1/users/#{last_active_admin.id}", params: { role: "viewer" }, headers: auth_headers(last_active_admin)

      assert_response :unprocessable_entity
      assert_equal "admin", last_active_admin.reload.role
      assert_equal [ "At least one admin is required" ], JSON.parse(response.body).fetch("errors")
    end
  end

  test "Clerk invitation is not revoked when local delete rolls back" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      invited = User.create!(clerk_id: "pending_123", email: "pending@example.com", role: "viewer", invitation_status: "pending", clerk_invitation_id: "inv_123")
      revoked = []

      with_revoke_override(->(invitation_id) { revoked << invitation_id }) do
        invalid_event = AuditEvent.new
        original_record = AuditEvent.method(:record!)
        begin
          AuditEvent.define_singleton_method(:record!) { |**| raise ActiveRecord::RecordInvalid.new(invalid_event) }
          delete "/api/v1/users/#{invited.id}", headers: auth_headers(admin)
        ensure
          AuditEvent.define_singleton_method(:record!, original_record)
        end
      end

      assert_response :unprocessable_entity
      assert_empty revoked
      assert User.exists?(invited.id)
    end
  end

  test "cannot resend invitation for inactive user" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      invited = User.create!(clerk_id: "pending_123", email: "pending@example.com", role: "viewer", invitation_status: "pending", active: false)

      post "/api/v1/users/#{invited.id}/resend_invitation", headers: auth_headers(admin)

      assert_response :unprocessable_entity
      assert_equal [ "Cannot resend an invitation for an inactive user" ], JSON.parse(response.body).fetch("errors")
    end
  end

  test "failed resend keeps previous Clerk invitation intact" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      invited = User.create!(clerk_id: "pending_123", email: "pending@example.com", role: "viewer", invitation_status: "pending", clerk_invitation_id: "inv_old")
      revoked = []

      with_revoke_override(->(invitation_id) { revoked << invitation_id }) do
        post "/api/v1/users/#{invited.id}/resend_invitation", headers: auth_headers(admin)
      end

      assert_response :success
      assert_empty revoked
      assert_equal "inv_old", invited.reload.clerk_invitation_id
      assert_equal "CLERK_SECRET_KEY is not configured", JSON.parse(response.body).fetch("invitation_error")
    end
  end

  test "successful resend revokes previous Clerk invitation after saving replacement" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      invited = User.create!(clerk_id: "pending_123", email: "pending@example.com", role: "viewer", invitation_status: "pending", clerk_invitation_id: "inv_old")
      revoked = []

      with_create_invitation_override(->(**) { { success: true, invitation_id: "inv_new", url: "https://clerk.example.test/invite" } }) do
        with_revoke_override(->(invitation_id) { revoked << invitation_id }) do
          post "/api/v1/users/#{invited.id}/resend_invitation", headers: auth_headers(admin)
        end
      end

      assert_response :success
      assert_equal "inv_new", invited.reload.clerk_invitation_id
      assert_equal [ "inv_old" ], revoked
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

  test "cannot demote a bootstrap admin" do
    with_auth_env("CLERK_BOOTSTRAP_ADMIN_EMAILS" => "bootstrap@example.com") do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      bootstrap_admin = User.create!(clerk_id: "bootstrap_123", email: "bootstrap@example.com", role: "admin")

      patch "/api/v1/users/#{bootstrap_admin.id}", params: { role: "viewer" }, headers: auth_headers(admin)

      assert_response :unprocessable_entity
      assert_equal "admin", bootstrap_admin.reload.role
      assert_equal [ "This user is a bootstrap admin. Remove their email from CLERK_BOOTSTRAP_ADMIN_EMAILS before changing their role." ], JSON.parse(response.body).fetch("errors")
    end
  end

  test "invalid roles are rejected before model persistence" do
    with_auth_env do
      admin = User.create!(clerk_id: "admin_123", email: "admin@example.com", role: "admin")
      viewer = User.create!(clerk_id: "viewer_123", email: "viewer@example.com", role: "viewer")

      patch "/api/v1/users/#{viewer.id}", params: { role: "superadmin" }, headers: auth_headers(admin)

      assert_response :unprocessable_entity
      assert_equal "viewer", viewer.reload.role
      assert_equal [ "Role must be one of: admin, dispatcher, viewer" ], JSON.parse(response.body).fetch("errors")
    end
  end

  private

  def with_auth_env(values = {})
    previous = AUTH_ENV_KEYS.to_h { |key| [ key, ENV[key] ] }
    AUTH_ENV_KEYS.each { |key| ENV.delete(key) }
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each do |key, value|
      value.nil? ? ENV.delete(key) : ENV[key] = value
    end
  end

  AUTH_ENV_KEYS = %w[CLERK_JWKS_URL CLERK_DOMAIN CLERK_SECRET_KEY CLERK_BOOTSTRAP_ADMIN_EMAILS].freeze

  def auth_headers(user)
    { "Authorization" => "Bearer test_token:#{user.clerk_id}:#{user.email}" }
  end

  def with_revoke_override(override)
    klass = Auth::ClerkInvitationService
    original = klass.instance_method(:revoke_invitation)
    klass.define_method(:revoke_invitation, &override)
    yield
  ensure
    klass.define_method(:revoke_invitation, original)
  end

  def with_create_invitation_override(override)
    klass = Auth::ClerkInvitationService
    original = klass.instance_method(:create_invitation)
    klass.define_method(:create_invitation, &override)
    yield
  ensure
    klass.define_method(:create_invitation, original)
  end
end
