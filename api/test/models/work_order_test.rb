require "test_helper"

class WorkOrderTest < ActiveSupport::TestCase
  test "uses Guam local time for SLA calculations" do
    assert_equal "Guam", Time.zone.name

    reported_at = Time.zone.parse("2026-05-05 23:30")
    order = work_order(title: "Late Guam request", priority: "P3", status: "needs_assessment", reported_at: reported_at)

    assert_equal 10.hours, order.reported_at.utc_offset
    assert_equal Time.zone.parse("2026-05-06 23:30"), order.assessment_due_at
    assert_equal Time.zone.parse("2026-05-07 23:30"), order.repair_due_at
  end

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

  test "does not mark legacy response-due-only records as SLA missing" do
    order = work_order(title: "Legacy response due")
    due_at = Time.zone.local(2026, 5, 5, 10, 0, 0)
    order.update_columns(reported_at: nil, assessment_due_at: nil, response_due_at: due_at, repair_due_at: nil)
    order.reload

    refute order.sla_missing?
    assert_equal due_at, order.sla_due_at
  end

  test "preserves caller-provided SLA due dates" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    custom_assessment_due_at = Time.zone.local(2026, 5, 5, 9, 30, 0)
    custom_repair_due_at = Time.zone.local(2026, 5, 5, 11, 45, 0)
    order = WorkOrder.create!(
      client: client,
      location: location,
      title: "Custom SLA",
      description: "Custom SLA",
      priority: "P1",
      normalized_priority: "P1",
      status: "needs_assessment",
      original_status_text: "needs_assessment",
      trade_category: "General",
      reported_at: reported_at,
      assessment_due_at: custom_assessment_due_at,
      repair_due_at: custom_repair_due_at
    )

    assert_equal custom_assessment_due_at, order.assessment_due_at
    assert_equal custom_assessment_due_at, order.response_due_at
    assert_equal custom_repair_due_at, order.repair_due_at
  end

  test "does not invent SLA dates when report time is absent" do
    order = work_order(title: "Missing clock", priority: "P3", reported_at: nil)

    assert_nil order.reported_at
    assert_nil order.requested_at
    assert_nil order.assessment_due_at
    assert_nil order.response_due_at
    assert_nil order.repair_due_at
    assert order.sla_missing?
  end

  test "uses requested time as SLA source when reported time is absent" do
    requested_at = Time.zone.local(2026, 5, 5, 8, 15, 0)
    order = WorkOrder.create!(
      client: client,
      location: location,
      title: "Requested time only",
      description: "Requested time only",
      priority: "P3",
      normalized_priority: "P3",
      status: "approved",
      original_status_text: "approved",
      trade_category: "General",
      requested_at: requested_at
    )

    assert_equal requested_at, order.reported_at
    assert_equal requested_at, order.requested_at
    assert_equal requested_at + 24.hours, order.assessment_due_at
    assert_equal requested_at + 48.hours, order.repair_due_at
  end

  test "updates auto-calculated SLA due dates when reported time changes" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    corrected_reported_at = Time.zone.local(2026, 5, 5, 9, 15, 0)
    order = work_order(title: "Corrected report time", priority: "P2", reported_at: reported_at)

    order.update!(reported_at: corrected_reported_at)

    assert_equal corrected_reported_at + 2.hours, order.assessment_due_at
    assert_equal corrected_reported_at + 2.hours, order.response_due_at
    assert_equal corrected_reported_at + 4.hours, order.repair_due_at
  end

  test "SLA scopes ignore closed and archived work orders when used directly" do
    overdue_reported_at = 10.days.ago
    active = work_order(title: "Active overdue", priority: "P4", reported_at: overdue_reported_at)
    work_order(title: "Closed overdue", priority: "P4", status: "completed", reported_at: overdue_reported_at)
    work_order(title: "Archived overdue", priority: "P4", reported_at: overdue_reported_at).update!(archived_at: Time.current)
    missing = work_order(title: "Missing SLA")
    missing.update_columns(reported_at: nil, assessment_due_at: nil, response_due_at: nil, repair_due_at: nil)

    assert_equal [ active.id ], WorkOrder.sla_overdue_at.pluck(:id)
    assert_equal [ missing.id ], WorkOrder.sla_missing.pluck(:id)
  end

  test "preserves custom SLA due dates when reported time changes" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    custom_assessment_due_at = Time.zone.local(2026, 5, 5, 9, 45, 0)
    custom_repair_due_at = Time.zone.local(2026, 5, 5, 13, 30, 0)
    order = work_order(title: "Custom report correction", priority: "P2", reported_at: reported_at)
    order.update!(assessment_due_at: custom_assessment_due_at, response_due_at: custom_assessment_due_at, repair_due_at: custom_repair_due_at)

    order.update!(reported_at: reported_at + 30.minutes)

    assert_equal custom_assessment_due_at, order.assessment_due_at
    assert_equal custom_assessment_due_at, order.response_due_at
    assert_equal custom_repair_due_at, order.repair_due_at
  end

  test "recalculates auto SLA due dates after separate priority and reported time edits" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    corrected_reported_at = Time.zone.local(2026, 5, 5, 10, 0, 0)
    order = work_order(title: "Separate edits", priority: "P3", reported_at: reported_at)
    order.update!(priority: "P4", normalized_priority: "P4")

    order.update!(reported_at: corrected_reported_at)

    assert_equal corrected_reported_at + 4.days, order.assessment_due_at
    assert_equal corrected_reported_at + 8.days, order.repair_due_at
  end

  test "assessment status uses assessment due date and approved work uses repair due date" do
    reported_at = Time.zone.local(2026, 5, 5, 8, 0, 0)
    assessment = work_order(title: "Assess", priority: "P4", status: "needs_assessment", reported_at: reported_at)
    repair = work_order(title: "Repair", priority: "P4", status: "approved", reported_at: reported_at)

    assert_equal assessment.assessment_due_at, assessment.sla_due_at
    assert_equal repair.repair_due_at, repair.sla_due_at
  end

  test "fractional custom deadlines survive report and priority edits" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    custom_assessment = reported_at + 2.hours + Rational(1, 2)
    custom_repair = reported_at + 4.hours + Rational(1, 2)
    order.update!(assessment_due_at: custom_assessment, response_due_at: custom_assessment, repair_due_at: custom_repair)

    order.reload.update!(reported_at: reported_at + 1.hour)
    assert_equal custom_assessment, order.reload.assessment_due_at
    assert_equal custom_assessment, order.response_due_at
    assert_equal custom_repair, order.repair_due_at
    order.update!(priority: "P3", normalized_priority: "P3")
    assert_equal custom_assessment, order.reload.assessment_due_at
    assert_equal custom_assessment, order.response_due_at
    assert_equal custom_repair, order.repair_due_at
  end

  test "custom deadlines one microsecond either side of automatic time remain custom" do
    reported_at = Time.zone.local(2026, 10, 11, 10).change(usec: 123_456)
    order = work_order(priority: "P2", reported_at: reported_at)
    custom_assessment = order.assessment_due_at + Rational(1, 1_000_000)
    custom_response = order.response_due_at + Rational(2, 1_000_000)
    custom_repair = order.repair_due_at - Rational(1, 1_000_000)
    order.update!(assessment_due_at: custom_assessment, response_due_at: custom_response, repair_due_at: custom_repair)

    order.reload.update!(reported_at: (reported_at + 1.hour).change(usec: 654_321), priority: "P3", normalized_priority: "P3")
    assert_equal custom_assessment, order.reload.assessment_due_at
    assert_equal custom_response, order.response_due_at
    assert_equal custom_repair, order.repair_due_at
  end

  test "exact fractional automatic deadlines still recalculate" do
    reported_at = Time.zone.local(2026, 10, 11, 10).change(usec: 123_456)
    corrected_at = (reported_at + 1.hour).change(usec: 654_321)
    order = work_order(priority: "P2", reported_at: reported_at)

    order.reload.update!(reported_at: corrected_at, priority: "P3", normalized_priority: "P3")
    assert_equal corrected_at + 24.hours, order.reload.assessment_due_at
    assert_equal corrected_at + 24.hours, order.response_due_at
    assert_equal corrected_at + 48.hours, order.repair_due_at
  end

  test "legacy whole-second automatic deadlines recalculate from fractional reported time" do
    reported_at = Time.zone.local(2026, 10, 11, 10).change(usec: 123_456)
    corrected_at = (reported_at + 1.hour).change(usec: 654_321)
    order = work_order(priority: "P2", reported_at: reported_at)
    order.update_columns(assessment_due_at: (reported_at + 2.hours).change(usec: 0), response_due_at: (reported_at + 2.hours).change(usec: 0), repair_due_at: (reported_at + 4.hours).change(usec: 0))

    order.reload.update!(reported_at: corrected_at, priority: "P3", normalized_priority: "P3")
    assert_equal corrected_at + 24.hours, order.reload.assessment_due_at
    assert_equal corrected_at + 24.hours, order.response_due_at
    assert_equal corrected_at + 48.hours, order.repair_due_at
  end

  test "custom repair clock survives while automatic assessment clocks recalculate" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    custom_repair = order.repair_due_at + Rational(1, 1_000_000)
    order.update!(repair_due_at: custom_repair)

    order.reload.update!(reported_at: reported_at + 1.hour)
    assert_equal reported_at + 3.hours, order.reload.assessment_due_at
    assert_equal reported_at + 3.hours, order.response_due_at
    assert_equal custom_repair, order.repair_due_at
  end

  test "new explicit custom deadlines survive the same receipt and priority correction" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    assessment = reported_at + 2.hours + Rational(1, 2)
    response = reported_at + 2.hours + Rational(3, 4)
    repair = reported_at + 4.hours + Rational(1, 2)
    order.reload.update!(reported_at: reported_at + 1.hour, priority: "P3", normalized_priority: "P3", assessment_due_at: assessment, response_due_at: response, repair_due_at: repair)

    assert_equal assessment, order.reload.assessment_due_at
    assert_equal response, order.response_due_at
    assert_equal repair, order.repair_due_at
  end

  test "new custom repair preserves untouched legacy automatic assessment recalculation" do
    reported_at = Time.zone.local(2026, 10, 11, 10).change(usec: 123_456)
    order = work_order(priority: "P1", reported_at: reported_at)
    order.update_columns(assessment_due_at: (reported_at + 2.hours).change(usec: 0), response_due_at: (reported_at + 2.hours).change(usec: 0))
    corrected = (reported_at + 1.hour).change(usec: 654_321)
    repair = (reported_at + 4.hours).change(usec: 500_000)
    order.reload.update!(reported_at: corrected, repair_due_at: repair)

    assert_equal corrected + 2.hours, order.reload.assessment_due_at
    assert_equal corrected + 2.hours, order.response_due_at
    assert_equal repair, order.repair_due_at
  end

  test "blank deadlines get new defaults during receipt and priority corrections" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    corrected = reported_at + 1.hour
    order.update!(reported_at: corrected, priority: "P3", normalized_priority: "P3", assessment_due_at: nil, response_due_at: nil, repair_due_at: nil)

    assert_equal corrected + 24.hours, order.reload.assessment_due_at
    assert_equal corrected + 24.hours, order.response_due_at
    assert_equal corrected + 48.hours, order.repair_due_at
  end

  test "automatic deadlines recalculate through repeated validations before save" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    order.reload.reported_at = reported_at + 1.hour
    assert order.valid?
    assert_equal reported_at + 3.hours, order.assessment_due_at
    order.reported_at = reported_at + 2.hours
    order.save!

    assert_equal reported_at + 4.hours, order.reload.assessment_due_at
    assert_equal reported_at + 4.hours, order.response_due_at
    assert_equal reported_at + 6.hours, order.repair_due_at
  end

  test "reload discards old automatic markers before later explicit custom values" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    order.reported_at = reported_at + 1.hour + Rational(1, 2)
    assert order.valid?
    former_assessment = order.assessment_due_at
    former_repair = order.repair_due_at
    assert_same order, order.reload
    assert_equal reported_at, order.reported_at
    order.update!(reported_at: reported_at + 2.hours, assessment_due_at: former_assessment, repair_due_at: former_repair)

    assert_equal former_assessment, order.reload.assessment_due_at
    assert_equal former_assessment, order.response_due_at
    assert_equal former_repair, order.repair_due_at
  end

  test "successful save retires discarded automatic markers before object reuse" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    order.reported_at = reported_at + 1.hour + Rational(1, 2)
    assert order.valid?
    former_assessment = order.assessment_due_at
    former_repair = order.repair_due_at
    order.update!(reported_at: reported_at, assessment_due_at: reported_at + 2.hours, response_due_at: reported_at + 2.hours, repair_due_at: reported_at + 4.hours, notes: "Saved restored receipt")
    order.update!(reported_at: reported_at + 2.hours, assessment_due_at: former_assessment, repair_due_at: former_repair)

    assert_equal former_assessment, order.reload.assessment_due_at
    assert_equal former_repair, order.repair_due_at
    assert_equal "Saved restored receipt", order.notes
  end

  test "failed validation retains pending automatic markers for later receipt correction" do
    reported_at = Time.zone.local(2026, 10, 11, 10)
    order = work_order(priority: "P1", reported_at: reported_at)
    order.reported_at = reported_at + 1.hour + Rational(1, 2)
    assert order.valid?
    order.status = "invalid_status"
    assert_not order.valid?
    order.update!(status: "approved", reported_at: reported_at + 2.hours)

    assert_equal reported_at + 4.hours, order.reload.assessment_due_at
    assert_equal reported_at + 4.hours, order.response_due_at
    assert_equal reported_at + 6.hours, order.repair_due_at
  end

  test "status must be one of the supported lifecycle states" do
    order = work_order(title: "Invalid lifecycle test")

    order.status = "made_up_status"

    assert_not order.valid?
    assert_includes order.errors[:status], "is not included in the list"
  end
end
