require "test_helper"

class MonthlyReportServiceTest < ActiveSupport::TestCase
  test "summarizes monthly work orders PM tasks and follow ups" do
    mobil = client("Mobil")
    loc = location(name: "Tamuning", region: "Central", client_record: mobil)
    line = service_line("Mobil / CBRE")

    WorkOrder.create!(
      client: mobil,
      location: loc,
      service_line: line,
      external_id: "WO-PA-1",
      source: "test",
      title: "Waiting parts",
      description: "Waiting on pump parts",
      priority: "P3",
      normalized_priority: "P3",
      status: "waiting_for_parts",
      original_status_text: "waiting_for_parts",
      trade_category: "Plumbing",
      reported_at: Time.zone.local(2026, 6, 4, 9, 0),
      pa_project: true,
      corrective_maintenance: true,
      estimate_required: true,
      estimate_number: "EST-77",
      parts_status: "Ordered from vendor",
      parts_ordered: true,
      parts_ordered_at: Time.zone.local(2026, 6, 5, 10, 0),
      parts_eta: Date.new(2026, 6, 20),
      follow_up_due_on: Date.new(2026, 6, 15),
      follow_up_owner: "John",
      vendor_reference: "PO-9",
      latest_follow_up_note: "Vendor confirmed ETA"
    )
    WorkOrder.create!(
      client: mobil,
      location: loc,
      service_line: line,
      external_id: "WO-CLOSED",
      source: "test",
      title: "Closed repair",
      description: "Done",
      priority: "P4",
      normalized_priority: "P4",
      status: "completed",
      original_status_text: "completed",
      trade_category: "General",
      reported_at: Time.zone.local(2026, 6, 6, 9, 0)
    )
    pm_task(task_name: "Monthly PM", date: Date.new(2026, 6, 2), location_record: loc).update!(status: "completed", completed_at: Time.zone.local(2026, 6, 2, 12, 0))
    pm_task(task_name: "Deferred PM", date: Date.new(2026, 6, 3), location_record: loc).update!(status: "deferred", deferred_until: Date.new(2026, 7, 1))

    travel_to Time.zone.local(2026, 6, 15, 8, 0) do
      payload = MonthlyReportService.new(month: "2026-06").payload

      assert_equal "2026-06", payload.fetch(:month)
      assert_equal 2, payload.dig(:work_orders, :total)
      assert_equal 1, payload.dig(:work_orders, :pa_projects)
      assert_equal 1, payload.dig(:work_orders, :corrective_maintenance)
      assert_equal 1, payload.dig(:work_orders, :estimate_required)
      assert_equal 1, payload.dig(:work_orders, :waiting_for_parts)
      assert_equal 2, payload.dig(:pm_tasks, :total)
      assert_equal 1, payload.dig(:pm_tasks, :completed)
      assert_equal 1, payload.dig(:pm_tasks, :deferred)
      assert_equal 1, payload.dig(:follow_ups, :due_today)
      assert_equal 1, payload.dig(:follow_ups, :parts_eta_this_month)
    end
  end

  test "CSV includes follow up and parts detail" do
    wo = work_order(title: "CSV parts", status: "waiting_for_parts", date: nil, reported_at: Time.zone.local(2026, 6, 10, 8, 0))
    wo.update!(parts_status: "Ordered", parts_ordered: true, parts_eta: Date.new(2026, 6, 25), follow_up_due_on: Date.new(2026, 6, 18), follow_up_owner: "George", vendor_reference: "PO-12", estimate_required: true, estimate_number: "EST-12")

    csv = MonthlyReportService.new(month: "2026-06").to_csv

    assert_includes csv, "Estimate #"
    assert_includes csv, "EST-12"
    assert_includes csv, "PO-12"
    assert_includes csv, "George"
  end
end
