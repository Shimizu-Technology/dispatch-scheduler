class DispatchSuggestionService
  START_TIME = Time.zone.parse("08:00")

  def initialize(date:)
    @date = Date.parse(date.to_s)
  end

  def call
    schedule = DispatchSchedule.create!(date: @date, status: "draft")
    teams = Team.includes(:technicians, :team_memberships).to_a
    team_cycle = teams.cycle
    counters = Hash.new(0)

    schedulables.each do |item|
      team = choose_team(item, teams) || team_cycle.next
      index = counters[team.id]
      counters[team.id] += 1
      schedule.dispatch_items.create!(
        work_order: item.is_a?(WorkOrder) ? item : nil,
        pm_task: item.is_a?(PmTask) ? item : nil,
        team: team,
        order_index: index,
        scheduled_time: START_TIME + (index * 2).hours,
        notes: notes_for(item, team)
      )
    end

    schedule
  end

  private

  def schedulables
    work_orders = WorkOrder.includes(:client, :location, :team)
      .open
      .where("scheduled_date = ? OR scheduled_date IS NULL", @date)
      .reject { |wo| %w[waiting_for_parts waiting_for_approval].include?(wo.status) }
      .sort_by { |wo| [wo.urgent_rank, region_rank(wo.location.region), wo.status == "needs_assessment" ? 0 : 1, wo.location.name.to_s] }

    pms = PmTask.includes(:client, :location).where(scheduled_date: @date).sort_by { |pm| [region_rank(pm.location.region), pm.location.name] }
    (work_orders.first(18) + pms.first(8))
  end

  def choose_team(item, teams)
    trade = item.trade_category
    region = item.location.region
    available = teams.select { |team| team.has_driver?(@date) }
    skill_match = available.select { |team| team.skills.include?(trade) || trade == "General" }
    regional = skill_match.select { |team| team.region_preference.blank? || team.region_preference == region }
    (regional.presence || skill_match.presence || available.presence || teams).min_by { |team| team.dispatch_items.joins(:dispatch_schedule).where(dispatch_schedules: { date: @date }).count }
  end

  def region_rank(region)
    { "North" => 0, "Central" => 1, "South" => 2, "Islandwide" => 3, "Unknown" => 4 }.fetch(region, 5)
  end

  def notes_for(item, team)
    warnings = []
    warnings << "Driver OK" if team.has_driver?(@date)
    warnings << "No driver warning" unless team.has_driver?(@date)
    warnings << "Check skill match: #{item.trade_category}" unless team.skills.include?(item.trade_category) || item.trade_category == "General"
    warnings << "Keep in #{item.location.region} route if possible"
    warnings.join(" • ")
  end
end
