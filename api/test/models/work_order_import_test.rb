require "test_helper"

class WorkOrderImportTest < ActiveSupport::TestCase
  test "database requires a source fingerprint" do
    user = User.create!(clerk_id: "fingerprint_test_123", email: "fingerprint-test@example.com", role: "dispatcher")
    timestamp = Time.current

    assert_raises ActiveRecord::NotNullViolation do
      WorkOrderImport.insert_all!([ {
        user_id: user.id,
        source_kind: "pasted_text",
        source_sha256: nil,
        status: "pending",
        extracted_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      } ])
    end
  end
end
