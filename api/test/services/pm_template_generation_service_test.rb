require "test_helper"

class PmTemplateGenerationServiceTest < ActiveSupport::TestCase
  test "previews and generates monthly PMs from a reusable template" do
    mobil = client("Mobil")
    north = location(name: "Yigo North", region: "North", client_record: mobil)
    south = location(name: "Agat", region: "South", client_record: mobil)
    template = pm_template(
      name: "Mobil Monthly PMs",
      client_record: mobil,
      locations: [ north, south ],
      items: [
        { task_name: "Electrical Inspection", trade_category: "Electrical", frequency: "monthly", estimated_minutes: 45 },
        { task_name: "Generator Inspection", trade_category: "General", frequency: "monthly", estimated_minutes: 30 }
      ]
    )

    service = PmTemplateGenerationService.new(template: template, month: "2026-06")
    preview = service.preview

    assert_equal 4, preview.dig(:summary, :candidate_count)
    assert_equal 4, preview.dig(:summary, :new_count)
    assert_equal 2, preview.dig(:summary, :station_count)
    assert_equal Date.new(2026, 6, 30).iso8601, preview.dig(:period, :due_on)

    result = service.generate!

    assert_equal 4, result.dig(:summary, :created_count)
    assert_equal 0, result.dig(:summary, :duplicate_count)
    assert_equal 4, PmTask.count
    assert_equal [ Date.new(2026, 6, 1) ], PmTask.distinct.pluck(:period_start)
    assert_equal [ Date.new(2026, 6, 30) ], PmTask.distinct.pluck(:period_end)
    assert_equal [ Date.new(2026, 6, 30) ], PmTask.distinct.pluck(:scheduled_date)
    assert_equal [ 30, 45 ], PmTask.order(:estimated_minutes).pluck(:estimated_minutes).uniq
  end

  test "generation is duplicate safe when run twice" do
    site = location(name: "Duplicate Station")
    template = pm_template(locations: [ site ])

    first = PmTemplateGenerationService.new(template: template, month: "2026-06").generate!
    second = PmTemplateGenerationService.new(template: template, month: "2026-06").generate!

    assert_equal 1, first.dig(:summary, :created_count)
    assert_equal 0, second.dig(:summary, :created_count)
    assert_equal 1, second.dig(:summary, :duplicate_count)
    assert_equal 1, PmTask.count
  end

  test "generation treats manual PMs anywhere in the month as duplicates" do
    site = location(name: "Manual Duplicate Station")
    pm_task(task_name: "Electrical Inspection", date: Date.new(2026, 6, 15), location_record: site)
    template = pm_template(locations: [ site ], items: [ { task_name: "Electrical Inspection", trade_category: "Electrical" } ])

    preview = PmTemplateGenerationService.new(template: template, month: "2026-06").preview
    result = PmTemplateGenerationService.new(template: template, month: "2026-06").generate!

    assert_equal 1, preview.dig(:summary, :duplicate_count)
    assert_equal 0, preview.dig(:summary, :new_count)
    assert_equal 0, result.dig(:summary, :created_count)
    assert_equal 1, result.dig(:summary, :duplicate_count)
    assert_equal 1, PmTask.count
  end

  test "unexpected generation failures roll back already-created PM rows" do
    site = location(name: "Rollback Station")
    template = pm_template(
      locations: [ site ],
      items: [
        { task_name: "Electrical Inspection", trade_category: "Electrical" },
        { task_name: "Generator Inspection", trade_category: "General" }
      ]
    )
    dispatcher = User.create!(clerk_id: "rollback_dispatcher", email: "rollback-dispatcher@example.com", role: "dispatcher")
    original_record = AuditEvent.method(:record!)
    calls = 0
    AuditEvent.define_singleton_method(:record!) do |**kwargs|
      calls += 1
      raise StandardError, "audit failure" if calls == 2

      original_record.call(**kwargs)
    end

    assert_raises(StandardError) do
      PmTemplateGenerationService.new(template: template, month: "2026-06", user: dispatcher).generate!
    end
    assert_equal 0, PmTask.count
    assert_equal 0, AuditEvent.where(action: "pm_task.created").count
  ensure
    AuditEvent.define_singleton_method(:record!) do |**kwargs|
      original_record.call(**kwargs)
    end if original_record
  end

  test "database enforces generated PM uniqueness by item location and period" do
    site = location(name: "Race Guard Station")
    template = pm_template(locations: [ site ])
    PmTemplateGenerationService.new(template: template, month: "2026-06").generate!
    existing = PmTask.first

    assert_raises(ActiveRecord::RecordNotUnique) do
      ApplicationRecord.transaction(requires_new: true) do
        PmTask.create!(
          client: existing.client,
          location: existing.location,
          pm_template: existing.pm_template,
          pm_template_item: existing.pm_template_item,
          task_name: existing.task_name,
          trade_category: existing.trade_category,
          frequency: existing.frequency,
          scheduled_date: existing.scheduled_date,
          due_on: existing.due_on,
          period_start: existing.period_start,
          period_end: existing.period_end,
          estimated_minutes: existing.estimated_minutes,
          status: "pending"
        )
      end
    end
  end

  test "item location restrictions limit generated rows" do
    north = location(name: "Restricted North", region: "North")
    south = location(name: "Restricted South", region: "South")
    template = pm_template(locations: [ north, south ])
    item = template.pm_template_items.first
    item.pm_template_item_locations.create!(location: north)

    result = PmTemplateGenerationService.new(template: template, month: "2026-06").generate!

    assert_equal 1, result.dig(:summary, :created_count)
    assert_equal [ north.id ], PmTask.pluck(:location_id)
  end

  test "selected quarterly frequency is opt in" do
    site = location(name: "Quarterly Station")
    template = pm_template(
      locations: [ site ],
      items: [
        { task_name: "Monthly PM", frequency: "monthly" },
        { task_name: "Quarterly PM", frequency: "quarterly" }
      ]
    )

    monthly = PmTemplateGenerationService.new(template: template, month: "2026-06").preview
    all_selected = PmTemplateGenerationService.new(template: template, month: "2026-06", frequency_filters: %w[monthly quarterly]).preview

    assert_equal [ "Monthly PM" ], monthly.fetch(:rows).map { |row| row.fetch(:task_name) }
    assert_equal [ "Monthly PM", "Quarterly PM" ], all_selected.fetch(:rows).map { |row| row.fetch(:task_name) }.sort
  end
end
