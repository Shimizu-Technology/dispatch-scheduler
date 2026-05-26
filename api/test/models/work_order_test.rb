require "test_helper"

class WorkOrderTest < ActiveSupport::TestCase
  test "calculates P1 and P2 assessment and repair SLA due dates" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    order = work_order(title: "Emergency", priority: "P1", status: "needs_assessment", reported_at: reported_at)

    assert_equal reported_at, order.reported_at
    assert_equal reported_at + 2.hours, order.assessment_due_at
    assert_equal order.assessment_due_at, order.response_due_at
    assert_equal reported_at + 4.hours, order.repair_due_at
  end

  test "calculates P3 and P4 SLA due dates" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    p3 = work_order(title: "P3", priority: "P3", reported_at: reported_at)
    p4 = work_order(title: "P4", priority: "P4", reported_at: reported_at)

    assert_equal reported_at + 24.hours, p3.assessment_due_at
    assert_equal reported_at + 48.hours, p3.repair_due_at
    assert_equal reported_at + 4.days, p4.assessment_due_at
    assert_equal reported_at + 8.days, p4.repair_due_at
  end

  test "assessment status uses assessment due date and approved work uses repair due date" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    assessment = work_order(title: "Assess", priority: "P4", status: "needs_assessment", reported_at: reported_at)
    repair = work_order(title: "Repair", priority: "P4", status: "approved", reported_at: reported_at)

    assert_equal assessment.assessment_due_at, assessment.sla_due_at
    assert_equal repair.repair_due_at, repair.sla_due_at
  end

  test "status must be one of the supported lifecycle states" do
    order = work_order(title: "Invalid lifecycle test")

    order.status = "made_up_status"

    assert_not order.valid?
    assert_includes order.errors[:status], "is not included in the list"
  end
end
