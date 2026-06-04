require "test_helper"

class DispatchItemTest < ActiveSupport::TestCase
  test "snapshot technicians rolls back existing snapshot when a replacement row fails" do
    crew = team(name: "Snapshot Atomic Crew", skills: [ "General" ])
    schedule = DispatchSchedule.create!(date: DEFAULT_DATE, status: "draft")
    item = schedule.dispatch_items.create!(team: crew, work_order: work_order(title: "Atomic snapshot work"), order_index: 0)
    original_technician = crew.available_technicians(DEFAULT_DATE).first
    item.dispatch_item_technicians.create!(
      technician: original_technician,
      technician_name: "Existing Snapshot",
      primary_trade: "General",
      is_driver: true,
      position: 0
    )
    invalid_technician = Technician.create!(name: nil, primary_trade: "General", is_driver: false, active: true)
    crew.team_memberships.create!(technician: invalid_technician)

    assert_raises ActiveRecord::RecordInvalid do
      item.snapshot_technicians!
    end

    assert_equal [ "Existing Snapshot" ], item.reload.dispatch_item_technicians.pluck(:technician_name)
  end
end
