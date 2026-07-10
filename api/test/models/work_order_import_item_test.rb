require "test_helper"

class WorkOrderImportItemTest < ActiveSupport::TestCase
  test "repeated review transitions include a useful validation error" do
    reviewer = User.create!(clerk_id: "review_guard_123", email: "review-guard@example.com", role: "dispatcher")
    work_order_import = WorkOrderImport.create!(
      user: reviewer,
      source_kind: "pasted_text",
      source_text: "Guard this review",
      source_sha256: "review-guard-draft",
      extraction_model: "test-model",
      extracted_at: Time.current
    )
    item = work_order_import.items.create!(position: 0, extracted_data: { description: "Guard this review" })
    item.reject!(user: reviewer)

    approval_error = assert_raises ActiveRecord::RecordInvalid do
      item.approve!(work_order: work_order(title: "Should not link"), user: reviewer)
    end
    assert_equal [ "This intake draft has already been reviewed" ], approval_error.record.errors.full_messages

    item.reload
    rejection_error = assert_raises ActiveRecord::RecordInvalid do
      item.reject!(user: reviewer)
    end
    assert_equal [ "This intake draft has already been reviewed" ], rejection_error.record.errors.full_messages
  end
end
