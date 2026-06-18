require "set"

class DispatchSuggestionService
  START_TIME = Time.zone.parse("08:00")
  DEFAULT_DAILY_ITEM_LIMIT = 24
  DEFAULT_CREW_DAILY_MINUTES = 480
  DEFAULT_ITEM_MINUTES = 120
  DEFAULT_PM_MINUTES = 45

  attr_reader :summary

  def initialize(date:)
    @date = Date.parse(date.to_s)
    @summary = {}
    @previous_dispatch_contexts = {}
    @capacity_deferred_items_count = 0
    @over_capacity_items_count = 0
  end

  def call
    @capacity_deferred_items_count = 0
    @over_capacity_items_count = 0
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
      team_available_counts = teams.to_h { |team| [ team.id, team.available_technicians(@date).count ] }
      candidate_items = schedulables
      previous_contexts = @previous_dispatch_contexts.presence || previous_dispatch_contexts_for(candidate_items)
      scheduled_count = 0

      candidate_items.each do |item|
        break if scheduled_count >= daily_item_limit

        previous_context = previous_context_for(item, previous_contexts)
        item_minutes = estimated_minutes_for(item)
        choice = choose_team(item, teams, counters, team_minutes, team_skills, team_driver_status, team_available_counts, previous_context, item_minutes)
        unless choice
          @capacity_deferred_items_count += 1 if teams.any?
          next
        end

        team, capacity_overflow = choice
        index = counters[team.id]
        counters[team.id] += 1
        dispatch_item = schedule.dispatch_items.create!(
          work_order: item.is_a?(WorkOrder) ? item : nil,
          pm_task: item.is_a?(PmTask) ? item : nil,
          team: team,
          order_index: index,
          scheduled_time: START_TIME + team_minutes[team.id].minutes,
          capacity_overflow: capacity_overflow,
          notes: notes_for(item, team, team_skills[team.id], team_driver_status[team.id], team_available_counts[team.id], previous_context, capacity_overflow)
        )
        @over_capacity_items_count += 1 if capacity_overflow
        scheduled_count += 1
        dispatch_item.snapshot_technicians!
        team_minutes[team.id] += item_minutes
      end

      schedule.update!(capacity_deferred_items_count: @capacity_deferred_items_count)
      @summary = build_summary(candidate_items, schedule, previous_contexts)
    end

    schedule
  end

  private

  def schedulables
    work_orders = eligible_work_orders
    pm_tasks = pm_tasks_due(work_orders)
    same_location_pms = pm_tasks.group_by(&:location_id)
    used_pm_ids = Set.new
    urgent_work_orders, flexible_work_orders = work_orders.partition { |work_order| high_pressure_work_order?(work_order) }
    ordered_items = []

    urgent_work_orders.each { |work_order| append_work_order_with_same_location_pms(ordered_items, work_order, same_location_pms, used_pm_ids) }

    if pm_month_pressure?
      explicit_due_pms = pm_tasks.select { |pm_task| explicit_pm_due?(pm_task) && !used_pm_ids.include?(pm_task.id) }
      explicit_due_pms.each do |pm_task|
        ordered_items << pm_task
        used_pm_ids.add(pm_task.id)
      end
    end

    flexible_work_orders.each { |work_order| append_work_order_with_same_location_pms(ordered_items, work_order, same_location_pms, used_pm_ids) }

    pm_tasks.each do |pm_task|
      next if used_pm_ids.include?(pm_task.id)

      ordered_items << pm_task
      used_pm_ids.add(pm_task.id)
    end

    ordered_items
  end

  def append_work_order_with_same_location_pms(items, work_order, same_location_pms, used_pm_ids)
    items << work_order
    same_location_pms.fetch(work_order.location_id, []).each do |pm_task|
      next if used_pm_ids.include?(pm_task.id)

      items << pm_task
      used_pm_ids.add(pm_task.id)
    end
  end

  def eligible_work_orders
    scheduled_scope = WorkOrder.includes(:client, :location, :team)
      .dispatchable
      .sla_dispatchable_for_date(@date)
    carry_over_scope = WorkOrder.includes(:client, :location, :team)
      .dispatchable
      .joins(:dispatch_items)
      .where(dispatch_items: { outcome_status: "carry_over", carried_over_to_date: @date })
    unfinished_scope = WorkOrder.includes(:client, :location, :team).unfinished_previous_dispatch_for(@date)

    work_orders = (scheduled_scope.to_a + carry_over_scope.to_a + unfinished_scope.to_a).uniq(&:id)
    @previous_dispatch_contexts = previous_dispatch_contexts_for(work_orders)
    work_orders.sort_by do |work_order|
      previous_context = @previous_dispatch_contexts[work_order.id]
      [ previous_context_rank(previous_context), *work_order.sla_sort_key(@date), work_order.urgent_rank, region_rank(work_order.location.region), work_order.status == "needs_assessment" ? 0 : 1, work_order.location.name.to_s, work_order.id ]
    end
  end

  def pm_tasks_due(work_orders = [])
    explicit_due = PmTask.includes(:client, :location).dispatchable_for_date(@date).to_a
    location_ids = work_orders.map(&:location_id).uniq
    opportunistic = if location_ids.any?
      PmTask.includes(:client, :location).opportunistic_for_locations(@date, location_ids).to_a
    else
      []
    end
    month_pressure = if pm_month_pressure?
      PmTask.includes(:client, :location).for_month(@date).where(status: %w[pending scheduled]).to_a
    else
      []
    end
    (explicit_due + opportunistic + month_pressure)
      .uniq(&:id)
      .sort_by { |pm| pm_sort_key(pm) }
  end

  def choose_team(item, teams, counters, team_minutes, team_skills, team_driver_status, team_available_counts, previous_context, item_minutes)
    return nil if teams.empty?

    trade = item.trade_category
    region = item.location.region
    available = teams.select { |team| team_driver_status[team.id] }
    skill_match = available.select { |team| team_skills[team.id].include?(trade) || trade == "General" }
    staffing_match = skill_match.select { |team| enough_technicians?(item, team_available_counts[team.id]) }
    candidates = staffing_match.presence || skill_match.presence || available.presence || teams
    previous_team = previous_context&.team
    allow_overflow = capacity_overflow_allowed?(item, previous_context)

    if previous_team && candidates.include?(previous_team)
      if capacity_available?(previous_team, team_minutes[previous_team.id], item_minutes) || allow_overflow
        return [ previous_team, !capacity_available?(previous_team, team_minutes[previous_team.id], item_minutes) ]
      end
    end

    fitting_candidates = candidates.select { |team| capacity_available?(team, team_minutes[team.id], item_minutes) }
    if fitting_candidates.any?
      return [ best_team_for(item, fitting_candidates, counters, region), false ]
    end

    return [ best_team_for(item, candidates, counters, region), true ] if allow_overflow

    nil
  end

  def best_team_for(item, candidates, counters, region)
    candidates.min_by { |team| [ service_line_penalty(team, item), region_penalty(team, region), counters[team.id], team.name.to_s ] }
  end

  def notes_for(item, team, skills, has_driver, available_count, previous_context = nil, capacity_overflow = false)
    warnings = []
    if previous_context
      previous = previous_context.team
      if previous_context.outcome_status == "carry_over"
        warnings << "Carry-over from #{previous_context.dispatch_schedule.date.strftime('%b %-d')}"
      else
        warnings << "Unfinished from #{previous_context.dispatch_schedule.date.strftime('%b %-d')}"
      end
      warnings << "Previous crew: #{previous.name}"
      warnings << "Previous crew unavailable" if previous != team
      warnings << previous_context.outcome_notes if previous_context.outcome_notes.present?
    end
    warnings << "While you're there PM suggestion" if item.is_a?(PmTask) && item.scheduled_date != @date
    warnings << (has_driver ? "Driver OK" : "No driver warning")
    warnings << "Check skill match: #{item.trade_category}" unless skills.include?(item.trade_category) || item.trade_category == "General"
    if item.is_a?(WorkOrder) && required_technician_count_for(item) > available_count
      warnings << "Needs #{required_technician_count_for(item)} techs; assigned crew has #{available_count}"
    end
    warnings << "Capacity warning: exceeds #{format_minutes(team_capacity_minutes(team))} crew day" if capacity_overflow
    warnings << "Estimated #{format_hours(item.estimated_hours)}" if item.respond_to?(:estimated_hours) && item.estimated_hours.present?
    warnings << "Keep in #{item.location.region} route if possible"
    warnings.join(" | ")
  end

  def previous_context_for(item, contexts)
    return nil unless item.is_a?(WorkOrder)

    contexts[item.id]
  end

  def previous_dispatch_contexts_for(items)
    work_order_ids = items.select { |item| item.is_a?(WorkOrder) }.map(&:id)
    return {} if work_order_ids.empty?

    explicit = DispatchItem.includes(:dispatch_schedule, :team)
      .joins(:dispatch_schedule)
      .where(work_order_id: work_order_ids, outcome_status: "carry_over", carried_over_to_date: @date)
      .order("dispatch_schedules.date DESC", id: :desc)
      .each_with_object({}) { |dispatch_item, contexts| contexts[dispatch_item.work_order_id] ||= dispatch_item }

    pending = DispatchItem.includes(:dispatch_schedule, :team)
      .joins(:dispatch_schedule)
      .where(work_order_id: work_order_ids, outcome_status: "pending")
      .where(dispatch_schedules: { status: %w[finalized sent] })
      .where("dispatch_schedules.date < ?", @date)
      .order("dispatch_schedules.date DESC", id: :desc)
      .each_with_object({}) { |dispatch_item, contexts| contexts[dispatch_item.work_order_id] ||= dispatch_item }

    pending.merge(explicit)
  end

  def build_summary(candidate_items, schedule, previous_contexts)
    blocked = blocked_work_orders.count
    scheduled_items = schedule.dispatch_items.size
    deferred = [ candidate_items.size - scheduled_items, 0 ].max
    unfinished = candidate_items.count { |item| item.is_a?(WorkOrder) && previous_contexts[item.id]&.outcome_status == "pending" }
    capacity_deferred = @capacity_deferred_items_count
    over_capacity = @over_capacity_items_count
    {
      scheduled_items: scheduled_items,
      eligible_work_orders: candidate_items.count { |item| item.is_a?(WorkOrder) },
      eligible_pm_tasks: candidate_items.count { |item| item.is_a?(PmTask) },
      deferred_items: deferred,
      daily_item_limit: daily_item_limit,
      blocked_work_orders: blocked,
      unfinished_previous_items: unfinished,
      capacity_deferred_items: capacity_deferred,
      over_capacity_items: over_capacity,
      message: summary_message(blocked, deferred, unfinished, capacity_deferred, over_capacity)
    }
  end

  def summary_message(blocked, deferred, unfinished, capacity_deferred, over_capacity)
    notes = []
    notes << "#{unfinished} unfinished prior dispatch item(s) were carried forward." if unfinished.positive?
    notes << "#{deferred} eligible item(s) deferred by daily item/capacity limits." if deferred.positive?
    notes << "#{capacity_deferred} item(s) could not fit within crew-day capacity." if capacity_deferred.positive?
    notes << "#{over_capacity} urgent/carry-forward item(s) exceed normal crew-day capacity." if over_capacity.positive?
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

  def crew_daily_minutes
    ENV.fetch("DISPATCH_CREW_DAILY_MINUTES", DEFAULT_CREW_DAILY_MINUTES).to_i
  end

  def team_capacity_minutes(_team)
    crew_daily_minutes
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
    return item.estimated_minutes if item.is_a?(PmTask) && item.respond_to?(:estimated_minutes) && item.estimated_minutes.present?
    return DEFAULT_PM_MINUTES if item.is_a?(PmTask)
    return DEFAULT_ITEM_MINUTES unless item.respond_to?(:estimated_hours) && item.estimated_hours.present?

    minutes = (item.estimated_hours.to_d * 60).ceil
    minutes.positive? ? minutes : DEFAULT_ITEM_MINUTES
  end

  def required_technician_count_for(item)
    return 1 unless item.respond_to?(:required_technician_count)

    [ item.required_technician_count.to_i, 1 ].max
  end

  def enough_technicians?(item, available_count)
    available_count.to_i >= required_technician_count_for(item)
  end

  def capacity_available?(team, used_minutes, item_minutes)
    used_minutes + item_minutes <= team_capacity_minutes(team)
  end

  def capacity_overflow_allowed?(item, previous_context = nil)
    return false unless item.is_a?(WorkOrder)
    return true if previous_context.present?
    item.urgent_rank <= 1
  end

  def high_pressure_work_order?(work_order)
    return true if @previous_dispatch_contexts[work_order.id].present?
    return true if work_order.scheduled_date == @date
    return true if work_order.urgent_rank <= 1

    due_rank, = work_order.sla_sort_key(@date)
    due_rank.zero?
  end

  def explicit_pm_due?(pm_task)
    return true if pm_task.scheduled_date == @date
    return true if pm_task.deferred_until.present? && pm_task.deferred_until <= @date

    false
  end

  def pm_month_pressure?
    @date >= (@date.end_of_month - 7.days)
  end

  def pm_sort_key(pm_task)
    [ explicit_pm_due?(pm_task) ? 0 : 1, pm_task.scheduled_date || Date.new(2999, 12, 31), region_rank(pm_task.location.region), pm_task.location.name.to_s, pm_task.task_name.to_s, pm_task.id ]
  end

  def previous_context_rank(previous_context)
    return 2 unless previous_context
    return 0 if previous_context.outcome_status == "carry_over"

    1
  end

  def format_hours(value)
    decimal = value.to_d
    if (decimal % 1).zero?
      "#{decimal.to_i}h"
    else
      "#{decimal.to_f.round(2)}h"
    end
  end

  def format_minutes(value)
    hours = value.to_d / 60
    if (hours % 1).zero?
      "#{hours.to_i}h"
    else
      "#{hours.to_f.round(2)}h"
    end
  end
end
