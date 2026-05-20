require "test_helper"

class DispatchSuggestionServiceTest < ActiveSupport::TestCase
  test "rebuilds one draft schedule for repeated suggestions" do
    team(name: "North Crew", skills: [ "General" ])
    3.times { |index| work_order(title: "Open work #{index}") }

    first_schedule = DispatchSuggestionService.new(date: DEFAULT_DATE).call
    first_item_ids = first_schedule.dispatch_items.pluck(:id)
    second_schedule = DispatchSuggestionService.new(date: DEFAULT_DATE).call

    assert_equal first_schedule.id, second_schedule.id
    assert_equal 1, DispatchSchedule.where(date: DEFAULT_DATE, status: "draft").count
    assert_equal 3, second_schedule.dispatch_items.count
    assert_empty first_item_ids & second_schedule.dispatch_items.pluck(:id), "regeneration should rebuild draft items, not append to them"
  end

  test "holds date-scoped blocked work out of dispatch summary" do
    team(name: "North Crew", skills: [ "General" ])
    work_order(title: "Schedulable work")
    work_order(title: "Parts needed today", status: "waiting_for_parts")
    work_order(title: "Parts needed later", status: "waiting_for_parts", date: DEFAULT_DATE + 1.day)

    service = DispatchSuggestionService.new(date: DEFAULT_DATE)
    schedule = service.call

    assert_equal 1, schedule.dispatch_items.count
    assert_equal 1, service.summary[:blocked_work_orders]
    refute_includes schedule.dispatch_items.map(&:work_order).compact.map(&:status), "waiting_for_parts"
  end

  test "deferred summary uses the capped scheduling slice" do
    team(name: "North Crew", skills: [ "General" ])
    5.times { |index| work_order(title: "Candidate #{index}") }

    old_limit = ENV["DISPATCH_DAILY_ITEM_LIMIT"]
    ENV["DISPATCH_DAILY_ITEM_LIMIT"] = "2"
    service = DispatchSuggestionService.new(date: DEFAULT_DATE)
    schedule = service.call

    assert_equal 2, service.summary[:daily_item_limit]
    assert_equal 2, schedule.dispatch_items.count
    assert_equal 5, service.summary[:eligible_work_orders]
    assert_equal 3, service.summary[:deferred_items]
  ensure
    ENV["DISPATCH_DAILY_ITEM_LIMIT"] = old_limit
  end

  test "carry over work is suggested on the next day with previous crew preferred" do
    previous_team = team(name: "Previous Crew", skills: [ "Plumbing" ])
    other_team = team(name: "Other Crew", skills: [ "Plumbing" ])
    wo = work_order(title: "Unfinished plumbing", trade: "Plumbing", status: "carry_over", date: DEFAULT_DATE + 1.day)
    yesterday = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    yesterday.dispatch_items.create!(team: previous_team, work_order: wo, order_index: 0, outcome_status: "carry_over", outcome_notes: "Need return", carried_over_to_date: DEFAULT_DATE + 1.day)

    schedule = DispatchSuggestionService.new(date: DEFAULT_DATE + 1.day).call
    item = schedule.dispatch_items.first

    assert_equal wo.id, item.work_order_id
    assert_equal previous_team.id, item.team_id
    assert_includes item.notes, "Carry-over from #{DEFAULT_DATE.strftime('%b %-d')}"
    assert_includes item.notes, "Previous crew: Previous Crew"
    assert_not_equal other_team.id, item.team_id
  end

  test "pm task id collision does not receive work order carry over context" do
    previous_team = team(name: "Z Previous Crew", skills: [ "General" ])
    pm_team = team(name: "A PM Crew", skills: [ "General" ])
    wo = work_order(title: "Carry-over work", status: "carry_over", date: DEFAULT_DATE + 1.day)
    pm = pm_task(task_name: "Same id PM", date: DEFAULT_DATE + 1.day)
    assert_equal wo.id, pm.id, "test setup expects independent work order and PM task ids to collide"
    yesterday = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    yesterday.dispatch_items.create!(team: previous_team, work_order: wo, order_index: 0, outcome_status: "carry_over", outcome_notes: "Work order only", carried_over_to_date: DEFAULT_DATE + 1.day)

    schedule = DispatchSuggestionService.new(date: DEFAULT_DATE + 1.day).call
    pm_item = schedule.dispatch_items.find_by!(pm_task: pm)

    assert_equal pm_team.id, pm_item.team_id
    refute_includes pm_item.notes, "Carry-over from"
    refute_includes pm_item.notes, "Work order only"
  end

  test "completed and blocked carry over work is not suggested" do
    team(name: "Open Crew", skills: [ "General" ])
    completed = work_order(title: "Done yesterday", status: "completed", date: DEFAULT_DATE + 1.day)
    blocked = work_order(title: "Parts wait", status: "waiting_for_parts", date: DEFAULT_DATE + 1.day)
    yesterday = DispatchSchedule.create!(date: DEFAULT_DATE, status: "sent")
    yesterday.dispatch_items.create!(team: Team.first, work_order: completed, order_index: 0, outcome_status: "completed")
    yesterday.dispatch_items.create!(team: Team.first, work_order: blocked, order_index: 1, outcome_status: "waiting_parts")

    schedule = DispatchSuggestionService.new(date: DEFAULT_DATE + 1.day).call

    assert_empty schedule.dispatch_items
  end

  test "skill matching only uses technicians available on the schedule date" do
    hvac_team = team(name: "Unavailable HVAC", skills: [ "HVAC" ], driver: false, unavailable: true)
    general_team = team(name: "Available General", skills: [ "General" ])
    work_order(title: "AC repair", trade: "HVAC")

    schedule = DispatchSuggestionService.new(date: DEFAULT_DATE).call
    item = schedule.dispatch_items.first

    assert_equal general_team.id, item.team_id
    assert_includes item.notes, "Check skill match: HVAC"
    refute hvac_team.has_driver?(DEFAULT_DATE)
    assert_empty hvac_team.skills(DEFAULT_DATE)
  end
end
