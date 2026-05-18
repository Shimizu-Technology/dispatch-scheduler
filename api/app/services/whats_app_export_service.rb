class WhatsAppExportService
  def initialize(schedule)
    @schedule = schedule
  end

  def call
    ([ header_lines ] + crew_sections).flatten.join("\n")
  end

  def crews
    @crews ||= grouped_items.map do |team, items|
      technicians = team.technicians_for_date(@schedule.date).includes(:technician_availabilities).order(:name).to_a
      unavailable = technicians.filter_map do |technician|
        availability = availability_for(technician)
        availability&.status == "unavailable" ? [ technician, availability ] : nil
      end
      {
        team_id: team.id,
        team_name: team.name,
        technician_names: technicians.map(&:name),
        driver_names: technicians.select(&:is_driver).map(&:name),
        call_outs: unavailable.map { |technician, availability| { name: technician.name, reason: availability.reason.presence || "Unavailable" } },
        stops_count: items.size
      }
    end
  end

  private

  def header_lines
    [
      "JMI Dispatch - #{@schedule.date.strftime('%A, %b %-d, %Y')}",
      "Status: #{@schedule.status.titleize}",
      "Total: #{@schedule.dispatch_items.size} #{'stop'.pluralize(@schedule.dispatch_items.size)} across #{grouped_items.size} #{'crew'.pluralize(grouped_items.size)}",
      ""
    ]
  end

  def crew_sections
    grouped_items.map do |team, items|
      crew = crews.find { |payload| payload[:team_id] == team.id }
      lines = [ team.name.upcase ]
      lines << "Crew: #{crew_line(crew)}"
      lines << "Call-outs: #{call_out_line(crew)}" if crew[:call_outs].any?
      lines << ""

      items.each_with_index do |item, index|
        lines.concat(item_lines(item, index))
      end

      lines << "No assigned stops." if items.empty?
      lines << ""
      lines.join("\n")
    end
  end

  def item_lines(item, index)
    schedulable = item.schedulable
    prefix = "#{index + 1}) #{time(item)} -"
    lines = if item.work_order_id
      [
        "#{prefix} #{schedulable.client.name} / #{schedulable.location.name}",
        "   WO: #{schedulable.external_id.presence || 'N/A'} | #{schedulable.normalized_priority} | #{schedulable.trade_category}",
        "   Scope: #{clean_text(schedulable.description)}"
      ]
    else
      [
        "#{prefix} PM - #{schedulable.client.name} / #{schedulable.location.name}",
        "   Task: #{clean_text(schedulable.task_name)} | #{schedulable.trade_category}"
      ]
    end
    lines << "   Notes: #{clean_text(item.notes)}" if item.notes.present?
    lines << ""
    lines
  end

  def crew_line(crew)
    return "Not assigned" if crew[:technician_names].empty?

    crew[:technician_names].map do |name|
      crew[:driver_names].include?(name) ? "#{name} (Driver)" : name
    end.join(", ")
  end

  def call_out_line(crew)
    crew[:call_outs].map { |call_out| "#{call_out[:name]} - #{call_out[:reason]}" }.join(", ")
  end

  def grouped_items
    @grouped_items ||= @schedule.dispatch_items
      .includes(:team, work_order: [ :client, :location ], pm_task: [ :client, :location ])
      .order(:order_index, :id)
      .group_by(&:team)
      .sort_by { |team, _items| team.name }
  end

  def availability_for(technician)
    technician.technician_availabilities.find { |availability| availability.date == @schedule.date }
  end

  def time(item)
    item.scheduled_time&.strftime("%l:%M %p")&.strip || "TBD"
  end

  def clean_text(value)
    value.to_s.squish
  end
end
