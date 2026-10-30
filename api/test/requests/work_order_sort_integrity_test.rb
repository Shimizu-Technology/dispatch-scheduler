require "test_helper"

class WorkOrderSortIntegrityTest < ActionDispatch::IntegrationTest
  setup do
    @previous_jwks = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    User.create!(clerk_id: "sort_integrity", email: "sort-integrity@example.com", role: "dispatcher")
    @headers = { "Authorization" => "Bearer test_token:sort_integrity:sort-integrity@example.com" }
  end

  teardown do
    @previous_jwks.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = @previous_jwks
  end

  %w[asc desc].each do |direction|
    test "effective KPI deadline #{direction} keeps missing last and stable tied pages" do
      early = work_order(title: "Assessment first", status: "needs_assessment")
      early.update!(assessment_due_at: Time.zone.local(2026, 6, 10, 9), repair_due_at: Time.zone.local(2026, 6, 12, 18))
      middle = work_order(title: "Repair middle")
      middle.update!(repair_due_at: Time.zone.local(2026, 6, 10, 12), follow_up_due_on: Date.current)
      late = work_order(title: "Repair latest")
      late.update!(repair_due_at: Time.zone.local(2026, 6, 10, 15))
      tie = work_order(title: "Same middle deadline")
      tie.update!(repair_due_at: middle.repair_due_at, estimate_required: true)
      missing = work_order(title: "No deadline")
      extra_ties = 8.times.map do |index|
        record = work_order(title: "Boundary tie #{index}")
        record.update!(repair_due_at: middle.repair_due_at)
        record.id
      end
      tied_ids = [ middle.id, tie.id ] + extra_ties
      expected = direction == "asc" ? [ early.id ] + tied_ids + [ late.id, missing.id ] : [ late.id ] + tied_ids + [ early.id, missing.id ]
      assert_paginated_order("sla_due_at", direction, expected)
    end

    test "scheduled date #{direction} keeps missing last and stable tied pages" do
      early = work_order(title: "Early date", date: Date.new(2026, 6, 8))
      middle = work_order(title: "Middle date", date: Date.new(2026, 6, 9))
      middle.update!(follow_up_due_on: Date.current)
      late = work_order(title: "Late date", date: Date.new(2026, 6, 10))
      tie = work_order(title: "Same middle date", date: middle.scheduled_date)
      tie.update!(estimate_required: true)
      missing = work_order(title: "Unscheduled", date: nil)
      extra_ties = 8.times.map { |index| work_order(title: "Boundary tie #{index}", date: middle.scheduled_date).id }
      tied_ids = [ middle.id, tie.id ] + extra_ties
      expected = direction == "asc" ? [ early.id ] + tied_ids + [ late.id, missing.id ] : [ late.id ] + tied_ids + [ early.id, missing.id ]
      assert_paginated_order("scheduled_date", direction, expected)
    end
  end

  private

  def assert_paginated_order(sort, direction, expected)
    all = []
    (1..2).each do |page|
      get "/api/v1/work_orders", params: { sort: sort, direction: direction, page: page, per_page: 10, region: "North" }, headers: @headers
      assert_response :success
      data = JSON.parse(response.body)
      ids = data.fetch("work_orders").map { |record| record.fetch("id") }
      assert_equal expected.slice((page - 1) * 10, 10), ids
      assert_equal 13, data.dig("meta", "total_count")
      assert_equal 2, data.dig("meta", "total_pages")
      assert_equal 1, data.dig("meta", "sub_counts", "estimate_required")
      assert_equal 1, data.dig("meta", "sub_counts", "follow_up_due")
      all.concat(ids)
    end
    assert_equal expected, all
    # Reloading a tied boundary is stable rather than moving records between pages.
    get "/api/v1/work_orders", params: { sort: sort, direction: direction, page: 2, per_page: 10, region: "North" }, headers: @headers
    assert_response :success
    assert_equal expected.slice(10, 10), JSON.parse(response.body).fetch("work_orders").map { |record| record.fetch("id") }
  end
end
