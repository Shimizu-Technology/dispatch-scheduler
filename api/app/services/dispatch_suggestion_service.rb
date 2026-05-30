class DispatchSuggestionService
  START_TIME = Time.zone.parse("08:00")
  DEFAULT_DAILY_ITEM_LIMIT = 24
  DEFAULT_ITEM_MINUTES = 120

  attr_reader :summary

  def initialize(date:)
    @date = Date.parse(date.to_s)
    @summary = {}
  end

  def call
    schedule = nil
    ActiveRecord::Base.transaction do
      schedule = DispatchSchedule.find_or_initialize_by(date: @date, status: "draft")
      schedule.save! if schedule.new_record?
      schedule.dispatch_items.destroy_all

      teams = Team.active.includes(:service_lines, technicians: :technician_skills).order(:name).to_a
      counters = Hash.new(0)
      team_minutes = Hash.new(0)
      team_skills = teams.to_h { |team| [ team.id, team.skills(@date) ] }
      team_driver_status = teams.to_h { |team| [ team.id, team.has_driver?(@date) ] }
      candidate_items = schedulables
      carry_over_contexts = carry_over_contexts_for(candidate_items)
      items = candidate_items.first(daily_item_limit)

      items.each do |item|
        carry_over_context = carry_over_context_for(item, carry_over_contexts)
        team = choose_team(item, teams, counters, team_skills, team_driver_status, carry_over_context)
        next unless team

        index = counters[team.id]
        counters[team.id] += 1
        schedule.dispatch_items.create!(
          work_order: item.is_a?(WorkOrder) ? item : nil,
          pm_task: item.is_a?(PmTask) ? item : nil,
          team: team,
          order_index: index,
          scheduled_time: START_TIME + team_minutes[team.id].minutes,
          notes: notes_for(item, team, team_skills[team.id], team_driver_status[team.id], carry_over_context)
        )
        team_minutes[team.id] += estimated_minutes_for(item)
      end

      @summary = build_summary(candidate_items, schedule)
    end

    schedule
  end

  private

  def schedulables
    work_orders = eligible_work_orders
    work_orders + pm_tasks_due(work_orders)
  end

  def eligible_work_orders
    scheduled_scope = WorkOrder.includes(:client, :location, :team)
      .dispatchable
      .sla_dispatchable_for_date(@date)
    carry_over_scope = WorkOrder.includes(:client, :location, :team)
      .dispatchable
      .joins(:dispatch_items)
      .where(dispatch_items: { outcome_status: "carry_over", carried_over_to_date: @date })
    (scheduled_scope.to_a + carry_over_scope.to_a)
      .uniq(&:id)
      .sort_by { |wo| [ wo.status == "carry_over" ? 0 : 1, *wo.sla_sort_key(@date), wo.urgent_rank, region_rank(wo.location.region), wo.status == "needs_assessment" ? 0 : 1, wo.location.name.to_s, wo.id ] }
  end

  def pm_tasks_due(work_orders = [])
    explicit_due = PmTask.includes(:client, :location).dispatchable_for_date(@date).to_a
    location_ids = work_orders.map(&:location_id).uniq
    opportunistic = if location_ids.any?
      PmTask.includes(:client, :location).opportunistic_for_locations(@date, location_ids).to_a
    else
      []
    end
    (explicit_due + opportunistic)
      .uniq(&:id)
      .sort_by { |pm| [ pm.scheduled_date == @date ? 0 : 1, region_rank(pm.location.region), pm.location.name.to_s, pm.task_name.to_s, pm.id ] }
  end

  def choose_team(item, teams, counters, team_skills, team_driver_status, carry_over_context = nil)
    return nil if teams.empty?

    trade = item.trade_category
    region = item.location.region
    available = teams.select { |team| team_driver_status[team.id] }
    skill_match = available.select { |team| team_skills[team.id].include?(trade) || trade == "General" }
    candidates = skill_match.presence || available.presence || teams
    previous_team = carry_over_context&.team
    return previous_team if previous_team && candidates.include?(previous_team)

    candidates.min_by { |team| [ service_line_penalty(team, item), region_penalty(team, region), counters[team.id], team.name.to_s ] }
  end

  def notes_for(item, team, skills, has_driver, carry_over_context = nil)
    warnings = []
    if carry_over_context
      previous = carry_over_context.team
      warnings << "Carry-over from #{carry_over_context.dispatch_schedule.date.strftime('%b %-d')}"
      warnings << "Previous crew: #{previous.name}"
      warnings << "Previous crew unavailable" if previous != team
      warnings << carry_over_context.outcome_notes if carry_over_context.outcome_notes.present?
    end
    warnings << "While you're there PM suggestion" if item.is_a?(PmTask) && item.scheduled_date != @date
    warnings << (has_driver ? "Driver OK" : "No driver warning")
    warnings << "Check skill match: #{item.trade_category}" unless skills.include?(item.trade_category) || item.trade_category == "General"
    warnings << "Estimated #{format_hours(item.estimated_hours)}" if item.respond_to?(:estimated_hours) && item.estimated_hours.present?
    warnings << "Keep in #{item.location.region} route if possible"
    warnings.join(" | ")
  end

  def carry_over_context_for(item, contexts)
    return nil unless item.is_a?(WorkOrder)

    contexts[item.id]
  end

  def carry_over_contexts_for(items)
    work_order_ids = items.select { |item| item.is_a?(WorkOrder) }.map(&:id)
    DispatchItem.includes(:dispatch_schedule, :team)
      .joins(:dispatch_schedule)
      .where(work_order_id: work_order_ids, outcome_status: "carry_over", carried_over_to_date: @date)
      .order("dispatch_schedules.date DESC", id: :desc)
      .each_with_object({}) { |dispatch_item, contexts| contexts[dispatch_item.work_order_id] ||= dispatch_item }
  end

  def build_summary(candidate_items, schedule)
    blocked = blocked_work_orders.count
    deferred = [ candidate_items.size - schedule.dispatch_items.count, 0 ].max
    {
      scheduled_items: schedule.dispatch_items.count,
      eligible_work_orders: candidate_items.count { |item| item.is_a?(WorkOrder) },
      eligible_pm_tasks: candidate_items.count { |item| item.is_a?(PmTask) },
      deferred_items: deferred,
      daily_item_limit: daily_item_limit,
      blocked_work_orders: blocked,
      message: summary_message(blocked, deferred)
    }
  end

  def summary_message(blocked, deferred)
    notes = []
    notes << "#{deferred} eligible item(s) deferred by the daily draft limit." if deferred.positive?
    notes << "#{blocked} waiting-for-parts/approval item(s) were held out of dispatch." if blocked.positive?
    notes.presence&.join(" ") || "No eligible or blocked items were held out."
  end

  def blocked_work_orders
    WorkOrder.active_queue.open
      .where(status: blocked_statuses)
      .where("scheduled_date = ? OR scheduled_date IS NULL", @date)
  end

  def daily_item_limit
    ENV.fetch("DISPATCH_DAILY_ITEM_LIMIT", DEFAULT_DAILY_ITEM_LIMIT).to_i
  end

  def blocked_statuses
    WorkOrder::BLOCKED_STATUSES
  end

  def service_line_match?(team, item)
    return true unless item.respond_to?(:service_line_id) && item.service_line_id.present?
    return true if team.service_line_ids.empty?

    team.service_line_ids.include?(item.service_line_id)
  end

  def service_line_penalty(team, item)
    service_line_match?(team, item) ? 0 : 1
  end

  def region_penalty(team, region)
    return 0 if team.region_preference.blank? || team.region_preference == region

    1
  end

  def region_rank(region)
    { "North" => 0, "Central" => 1, "South" => 2, "Islandwide" => 3, "Unknown" => 4 }.fetch(region, 5)
  end

  def estimated_minutes_for(item)
    return DEFAULT_ITEM_MINUTES unless item.respond_to?(:estimated_hours) && item.estimated_hours.present?

    minutes = (item.estimated_hours.to_d * 60).ceil
    minutes.positive? ? minutes : DEFAULT_ITEM_MINUTES
  end

  def format_hours(value)
    decimal = value.to_d
    if (decimal % 1).zero?
      "#{decimal.to_i}h"
    else
      "#{decimal.to_f.round(2)}h"
    end
  end
end
