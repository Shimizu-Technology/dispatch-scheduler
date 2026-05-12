class WhatsAppExportService
  def initialize(schedule)
    @schedule = schedule
  end

  def call
    grouped = @schedule.dispatch_items.includes(:team, work_order: [ :client, :location ], pm_task: [ :client, :location ]).group_by(&:team)
    grouped.map do |team, items|
      lines = [ "#{team.name} - #{@schedule.date.strftime('%b %-d, %Y')}", "" ]
      items.sort_by(&:order_index).each_with_index do |item, idx|
        thing = item.schedulable
        if item.work_order_id
          lines << "#{idx + 1}. #{time(item)} - #{thing.client.name} #{thing.location.name}"
          lines << "   WO ##{thing.external_id || 'N/A'} - #{thing.normalized_priority} - #{thing.trade_category}"
          lines << "   #{thing.description}"
        else
          lines << "#{idx + 1}. #{time(item)} - PM: #{thing.client.name} #{thing.location.name}"
          lines << "   #{thing.task_name}"
        end
        lines << "   Notes: #{item.notes}" if item.notes.present?
        lines << ""
      end
      lines.join("\n")
    end.join("\n---\n")
  end

  private

  def time(item)
    item.scheduled_time&.strftime("%l:%M %p")&.strip || "TBD"
  end
end
