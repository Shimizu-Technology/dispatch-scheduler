require "test_helper"

class MonthlyReportServiceTest < ActiveSupport::TestCase
  test "summarizes monthly work orders PM tasks and follow ups" do
    travel_to Time.zone.local(2026, 6, 15, 8, 0) do
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
        follow_up_owner: "Dispatcher",
        vendor_reference: "PO-9",
        latest_follow_up_note: "Vendor confirmed ETA"
      )
      closed_work_order = WorkOrder.create!(
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
      closed_work_order.update_columns(closed_at: Time.zone.local(2026, 6, 6, 10, 0))
      pm_task(task_name: "Monthly PM", trade: "Electrical", date: Date.new(2026, 6, 2), location_record: loc).update!(status: "completed", completed_at: Time.zone.local(2026, 6, 2, 12, 0), time_in_at: Time.zone.local(2026, 6, 2, 8, 0), time_out_at: Time.zone.local(2026, 6, 2, 9, 45))
      pm_task(task_name: "Deferred PM", date: Date.new(2026, 6, 3), location_record: loc).update!(status: "deferred", deferred_until: Date.new(2026, 7, 1))

      payload = MonthlyReportService.new(month: "2026-06").payload

      assert_equal "2026-06", payload.fetch(:month)
      assert_equal 2, payload.dig(:work_orders, :total)
      assert_equal 2, payload.dig(:work_orders, :reported)
      assert_equal 2, payload.dig(:work_orders, :active_during_month)
      assert_equal payload.dig(:work_orders, :open_as_of), payload.dig(:work_orders, :open)
      assert_equal 1, payload.dig(:work_orders, :open_as_of)
      assert_equal payload.dig(:work_orders, :closed_during_month), payload.dig(:work_orders, :completed_or_closed)
      assert_equal 1, payload.dig(:work_orders, :closed_during_month)
      assert_equal 1, payload.dig(:work_orders, :pa_projects)
      assert_equal 1, payload.dig(:work_orders, :corrective_maintenance)
      assert_equal 1, payload.dig(:work_orders, :estimate_required)
      assert_equal 1, payload.dig(:work_orders, :waiting_for_parts)
      assert_equal 2, payload.dig(:pm_tasks, :total)
      assert_equal 1, payload.dig(:pm_tasks, :completed)
      assert_equal 1, payload.dig(:pm_tasks, :deferred)
      assert_equal 1, payload.dig(:pm_tasks, :timed)
      assert_equal 105, payload.dig(:pm_tasks, :actual_minutes)
      assert_equal({ "Electrical" => 105 }, payload.dig(:pm_tasks, :by_trade_actual_minutes))
      assert_equal 1, payload.dig(:follow_ups, :due_today)
      assert_equal 1, payload.dig(:follow_ups, :due_by_as_of)
      assert_equal 1, payload.dig(:follow_ups, :parts_eta_this_month)
    end
  end

  test "historical reports use the month-end cutoff and status history instead of today's state" do
    wo = nil
    travel_to Time.zone.local(2026, 5, 1, 8, 0) do
      wo = work_order(title: "Historical P4", priority: "P4", status: "approved", date: nil, reported_at: Time.current)
    end
    travel_to Time.zone.local(2026, 7, 10, 8, 0) do
      wo.update!(status: "completed")
    end

    travel_to Time.zone.local(2026, 7, 10, 9, 0) do
      payload = MonthlyReportService.new(month: "2026-05").payload

      assert_equal Time.zone.local(2026, 5, 31, 23, 59, 59).iso8601, payload.fetch(:as_of)
      assert_equal 1, payload.dig(:work_orders, :reported)
      assert_equal 1, payload.dig(:work_orders, :open_as_of)
      assert_equal 0, payload.dig(:work_orders, :closed_during_month)
      assert_equal({ "approved" => 1 }, payload.dig(:work_orders, :by_status))
      assert_equal 1, payload.dig(:work_orders, :kpi_overdue)
    end
  end

  test "historical reports preserve a closed interval when a work order is later reopened" do
    wo = nil
    travel_to Time.zone.local(2026, 5, 1, 8, 0) do
      wo = work_order(title: "Reopened work", priority: "P3", status: "approved", date: nil, reported_at: Time.current)
    end
    travel_to(Time.zone.local(2026, 5, 10, 8, 0)) { wo.update!(status: "completed") }
    travel_to(Time.zone.local(2026, 7, 1, 8, 0)) { wo.update!(status: "approved") }

    assert_equal [
      [ nil, "approved", Time.zone.local(2026, 5, 1, 8, 0) ],
      [ "approved", "completed", Time.zone.local(2026, 5, 10, 8, 0) ],
      [ "completed", "approved", Time.zone.local(2026, 7, 1, 8, 0) ]
    ], wo.status_events.order(:occurred_at).pluck(:from_status, :to_status, :occurred_at)

    payload = travel_to(Time.zone.local(2026, 7, 10, 8, 0)) { MonthlyReportService.new(month: "2026-05").payload }

    assert_equal 0, payload.dig(:work_orders, :open_as_of)
    assert_equal 1, payload.dig(:work_orders, :closed_during_month)
    assert_equal 1, payload.dig(:work_orders, :active_during_month)
  end

  test "historical reports label an unknowable pre-migration open status instead of inventing one" do
    wo = nil
    travel_to Time.zone.local(2026, 5, 1, 8, 0) do
      wo = work_order(title: "Legacy closed work", priority: "P3", status: "approved", date: nil, reported_at: Time.current)
    end
    closed_at = Time.zone.local(2026, 7, 1, 8, 0)
    wo.update_columns(status: "completed", closed_at: closed_at, updated_at: closed_at)
    wo.status_events.delete_all
    wo.status_events.create!(
      from_status: nil,
      to_status: "completed",
      source: "migration_backfill",
      occurred_at: closed_at
    )

    travel_to Time.zone.local(2026, 7, 10, 8, 0) do
      report = MonthlyReportService.new(month: "2026-05")
      payload = report.payload

      assert_equal 1, payload.dig(:work_orders, :open_as_of)
      assert_equal({ MonthlyReportService::UNKNOWN_PRE_MIGRATION_STATUS => 1 }, payload.dig(:work_orders, :by_status))
      assert_includes report.to_csv, MonthlyReportService::UNKNOWN_PRE_MIGRATION_STATUS
      refute_includes report.to_csv, ",new,"
    end
  end

  test "historical PM counts use status at the report cutoff" do
    pm = nil
    travel_to Time.zone.local(2026, 5, 1, 8, 0) do
      pm = pm_task(task_name: "Month end PM", date: Date.new(2026, 5, 20))
    end
    travel_to Time.zone.local(2026, 7, 1, 8, 0) do
      pm.update!(status: "completed", completed_at: Time.current)
    end

    payload = travel_to(Time.zone.local(2026, 7, 10, 8, 0)) { MonthlyReportService.new(month: "2026-05").payload }

    assert_equal 1, payload.dig(:pm_tasks, :total)
    assert_equal 0, payload.dig(:pm_tasks, :completed)
    assert_equal 1, payload.dig(:pm_tasks, :incomplete)
    assert_equal({ "pending" => 1 }, payload.dig(:pm_tasks, :by_status))
  end

  test "PM report counts a station bulk completion time window once" do
    mobil = client("Mobil")
    loc = location(name: "Dededo", region: "North", client_record: mobil)
    time_in = Time.zone.local(2026, 6, 8, 8, 0)
    time_out = Time.zone.local(2026, 6, 8, 9, 0)

    pm_task(task_name: "Electrical PM", trade: "Electrical", date: Date.new(2026, 6, 8), location_record: loc, estimated_minutes: 30).update!(status: "completed", completed_at: time_out, time_in_at: time_in, time_out_at: time_out)
    pm_task(task_name: "Plumbing PM", trade: "Plumbing", date: Date.new(2026, 6, 8), location_record: loc, estimated_minutes: 90).update!(status: "completed", completed_at: time_out, time_in_at: time_in, time_out_at: time_out)

    payload = MonthlyReportService.new(month: "2026-06").payload

    assert_equal 2, payload.dig(:pm_tasks, :timed)
    assert_equal 1, payload.dig(:pm_tasks, :timed_visits)
    assert_equal 60, payload.dig(:pm_tasks, :actual_minutes)
    assert_equal({ "Electrical" => 15, "Plumbing" => 45 }, payload.dig(:pm_tasks, :by_trade_actual_minutes))
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
