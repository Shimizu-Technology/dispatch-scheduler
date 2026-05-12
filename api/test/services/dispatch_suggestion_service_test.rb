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
    assert_equal 2, service.summary[:eligible_work_orders]
    assert_equal 0, service.summary[:deferred_items]
  ensure
    ENV["DISPATCH_DAILY_ITEM_LIMIT"] = old_limit
  end
end
