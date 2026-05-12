require "test_helper"

module Auth
  class UserSyncTest < ActiveSupport::TestCase
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
  end
end
