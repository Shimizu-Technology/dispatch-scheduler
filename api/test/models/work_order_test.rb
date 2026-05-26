require "test_helper"

class WorkOrderTest < ActiveSupport::TestCase
  test "status must be one of the supported lifecycle states" do
    order = work_order(title: "Invalid lifecycle test")

    order.status = "made_up_status"

    assert_not order.valid?
    assert_includes order.errors[:status], "is not included in the list"
  end
end
