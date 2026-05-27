require "test_helper"

module Auth
  class UserSyncTest < ActiveSupport::TestCase
    include ActiveSupport::Testing::TimeHelpers

    test "constraint retry stops after the configured retry limit" do
      calls = 0

      with_sync_user_override(->(_payload) do
        calls += 1
        raise ActiveRecord::RecordNotUnique, "collision"
      end) do
        assert_raises(ActiveRecord::RecordNotUnique) do
          UserSync.call({ "sub" => "user_123", "email" => "dispatcher@example.com" })
        end
      end

      assert_equal 2, calls
    end

    test "invited non-bootstrap users are linked and accepted" do
      invited = User.create!(clerk_id: "pending_123", email: "viewer@example.com", role: "viewer", invitation_status: "pending")

      user = UserSync.call({ "sub" => "viewer_123", "email" => "viewer@example.com", "name" => "Viewer User" })

      assert_equal invited.id, user.id
      assert_equal "viewer_123", user.clerk_id
      assert_equal "viewer", user.role
      assert_equal "viewer@example.com", user.email
      assert_equal "Viewer User", user.name
      assert_equal "accepted", user.invitation_status
      assert_not_nil user.invitation_accepted_at
    end

    test "uninvited non-bootstrap users are denied" do
      error = assert_raises(UserSync::AccessDenied) do
        UserSync.call({ "sub" => "viewer_123", "email" => "viewer@example.com", "name" => "Viewer User" })
      end

      assert_includes error.message, "has not been invited"
    end

    test "bootstrap admin email is resolved from the dedicated env var" do
      previous = ENV["CLERK_BOOTSTRAP_ADMIN_EMAILS"]
      ENV["CLERK_BOOTSTRAP_ADMIN_EMAILS"] = "owner@example.com"

      user = UserSync.call({ "sub" => "owner_123", "email" => "owner@example.com" })

      assert_equal "admin", user.role
    ensure
      previous.nil? ? ENV.delete("CLERK_BOOTSTRAP_ADMIN_EMAILS") : ENV["CLERK_BOOTSTRAP_ADMIN_EMAILS"] = previous
    end

    test "recently seen users are not touched on every authenticated request" do
      now = Time.zone.parse("2026-05-15 09:00:00")
      User.create!(clerk_id: "pending_viewer", email: "viewer@example.com", role: "viewer", invitation_status: "pending")

      travel_to now do
        UserSync.call({ "sub" => "viewer_123", "email" => "viewer@example.com", "name" => "Viewer User" })
      end

      user = User.find_by!(clerk_id: "viewer_123")
      original_last_seen_at = user.last_seen_at
      original_updated_at = user.updated_at

      travel_to now + 1.minute do
        UserSync.call({ "sub" => "viewer_123", "email" => "viewer@example.com", "name" => "Viewer User" })
      end

      user.reload
      assert_equal original_last_seen_at, user.last_seen_at
      assert_equal original_updated_at, user.updated_at
    end

    test "falls back to Clerk profile when token omits email" do
      fetched_clerk_ids = []

      User.create!(clerk_id: "pending_profile", email: "profile@example.com", role: "viewer", invitation_status: "pending")

      with_profile_fetch_override(->(clerk_id) do
        fetched_clerk_ids << clerk_id
        { "email" => "profile@example.com", "name" => "Profile User" }
      end) do
        user = UserSync.call({ "sub" => "clerk_123" })

        assert_equal [ "clerk_123" ], fetched_clerk_ids
        assert_equal "profile@example.com", user.email
        assert_equal "Profile User", user.name
      end
    end

    test "missing email explains the Clerk secret fallback" do
      with_profile_fetch_override(->(_clerk_id) { {} }) do
        error = assert_raises(UserSync::AccessDenied) do
          UserSync.call({ "sub" => "clerk_123" })
        end

        assert_equal "Missing Clerk email. Set CLERK_SECRET_KEY or configure Clerk token email claims.", error.message
      end
    end

    private

    def with_sync_user_override(override)
      singleton = UserSync.singleton_class
      original = singleton.instance_method(:sync_user)

      singleton.define_method(:sync_user, &override)
      singleton.send(:private, :sync_user)

      yield
    ensure
      singleton.define_method(:sync_user) { |payload| original.bind_call(self, payload) }
      singleton.send(:private, :sync_user)
    end

    def with_profile_fetch_override(override)
      singleton = ClerkUserProfile.singleton_class
      original = ClerkUserProfile.method(:fetch)

      singleton.define_method(:fetch, &override)
      yield
    ensure
      singleton.define_method(:fetch) { |clerk_id| original.call(clerk_id) }
    end
  end
end
