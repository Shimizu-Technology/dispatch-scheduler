class DispatchSuggestionService
  START_TIME = Time.zone.parse("08:00")

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

      teams = Team.includes(technicians: :technician_skills).order(:name).to_a
      counters = Hash.new(0)
      team_skills = teams.to_h { |team| [ team.id, team.skills ] }
      team_driver_status = teams.to_h { |team| [ team.id, team.has_driver?(@date) ] }
      items = schedulables

      items.each do |item|
        team = choose_team(item, teams, counters, team_skills, team_driver_status)
        next unless team

        index = counters[team.id]
        counters[team.id] += 1
        schedule.dispatch_items.create!(
          work_order: item.is_a?(WorkOrder) ? item : nil,
          pm_task: item.is_a?(PmTask) ? item : nil,
          team: team,
          order_index: index,
          scheduled_time: START_TIME + (index * 2).hours,
          notes: notes_for(item, team, team_skills[team.id], team_driver_status[team.id])
        )
      end

      @summary = build_summary(items, schedule)
    end

    schedule
  end

  private

  def schedulables
    eligible_work_orders + pm_tasks_due
  end

  def eligible_work_orders
    WorkOrder.includes(:client, :location, :team)
      .open
      .where("scheduled_date = ? OR scheduled_date IS NULL", @date)
      .reject { |wo| blocked_statuses.include?(wo.status) }
      .sort_by { |wo| [ wo.urgent_rank, region_rank(wo.location.region), wo.status == "needs_assessment" ? 0 : 1, wo.location.name.to_s, wo.id ] }
  end

  def pm_tasks_due
    PmTask.includes(:client, :location)
      .where(scheduled_date: @date)
      .sort_by { |pm| [ region_rank(pm.location.region), pm.location.name.to_s, pm.task_name.to_s, pm.id ] }
  end

  def choose_team(item, teams, counters, team_skills, team_driver_status)
    return nil if teams.empty?

    trade = item.trade_category
    region = item.location.region
    available = teams.select { |team| team_driver_status[team.id] }
    skill_match = available.select { |team| team_skills[team.id].include?(trade) || trade == "General" }
    regional = skill_match.select { |team| team.region_preference.blank? || team.region_preference == region }
    candidates = regional.presence || skill_match.presence || available.presence || teams
    candidates.min_by { |team| [ counters[team.id], region_penalty(team, region), team.name.to_s ] }
  end

  def notes_for(item, team, skills, has_driver)
    warnings = []
    warnings << (has_driver ? "Driver OK" : "No driver warning")
    warnings << "Check skill match: #{item.trade_category}" unless skills.include?(item.trade_category) || item.trade_category == "General"
    warnings << "Keep in #{item.location.region} route if possible"
    warnings.join(" | ")
  end

  def build_summary(items, schedule)
    blocked = WorkOrder.open.where(status: blocked_statuses).count
    {
      scheduled_items: schedule.dispatch_items.count,
      eligible_work_orders: items.count { |item| item.is_a?(WorkOrder) },
      eligible_pm_tasks: items.count { |item| item.is_a?(PmTask) },
      blocked_work_orders: blocked,
      message: blocked.positive? ? "#{blocked} waiting-for-parts/approval item(s) were held out of dispatch." : "No blocked work orders were held out."
    }
  end

  def blocked_statuses
    %w[waiting_for_parts waiting_for_approval]
  end

  def region_penalty(team, region)
    return 0 if team.region_preference.blank? || team.region_preference == region

    1
  end

  def region_rank(region)
    { "North" => 0, "Central" => 1, "South" => 2, "Islandwide" => 3, "Unknown" => 4 }.fetch(region, 5)
  end
end
