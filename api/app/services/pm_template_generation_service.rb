require "set"

class PmTemplateGenerationService
  DEFAULT_FREQUENCIES = [ "monthly" ].freeze

  def initialize(template:, month:, frequency_filters: nil, location_ids: nil, item_ids: nil, due_on: nil, user: nil)
    @template = template
    @month = parse_month(month)
    @period_start = @month.beginning_of_month
    @period_end = @month.end_of_month
    @frequency_filters = normalize_frequency_filters(frequency_filters)
    @location_ids = normalize_ids(location_ids)
    @item_ids = normalize_ids(item_ids)
    @due_on = due_on.present? ? Date.parse(due_on.to_s) : @period_end
    @user = user
  rescue Date::Error
    raise ArgumentError, "Invalid PM generation month or due date"
  end

  def preview
    rows = candidate_rows
    duplicate_lookup = duplicate_lookup_for(rows)
    {
      template: Serializers.pm_template(@template),
      month: month_key,
      period: { starts_on: @period_start.iso8601, ends_on: @period_end.iso8601, due_on: @due_on.iso8601 },
      summary: summary_for(rows, duplicate_lookup),
      rows: rows.map { |row| preview_row(row, duplicate_lookup) }
    }
  end

  def generate!
    created = []
    duplicates = []
    rows = candidate_rows
    duplicate_lookup = duplicate_lookup_for(rows)

    rows.each_with_index do |row, index|
      if duplicate_pm_task?(row, duplicate_lookup)
        duplicates << duplicate_payload(row, index)
        next
      end

      begin
        pm_task = create_pm_task_with_audit!(row)
        created << pm_task
        remember_duplicate(row, duplicate_lookup)
      rescue ActiveRecord::RecordNotUnique
        duplicates << duplicate_payload(row, index)
        remember_duplicate(row, duplicate_lookup)
      end
    end

    {
      template: Serializers.pm_template(@template),
      month: month_key,
      period: { starts_on: @period_start.iso8601, ends_on: @period_end.iso8601, due_on: @due_on.iso8601 },
      created: created.map { |pm_task| Serializers.pm_task(pm_task) },
      duplicates: duplicates,
      summary: {
        candidate_count: rows.length,
        created_count: created.length,
        duplicate_count: duplicates.length,
        station_count: rows.map { |row| row.fetch(:location).id }.uniq.length,
        item_count: rows.map { |row| row.fetch(:item).id }.uniq.length
      }
    }
  end

  private

  def parse_month(value)
    raw = value.to_s.strip
    raw = Date.current.strftime("%Y-%m") if raw.blank?
    Date.parse("#{raw}-01")
  end

  def month_key
    @month.strftime("%Y-%m")
  end

  def normalize_frequency_filters(values)
    filters = Array(values.presence || DEFAULT_FREQUENCIES).map(&:to_s).reject(&:blank?).uniq
    invalid = filters - PmTemplateItem::FREQUENCIES
    raise ArgumentError, "Invalid PM frequency: #{invalid.join(', ')}" if invalid.any?

    filters
  end

  def normalize_ids(values)
    ids = Array(values).reject(&:blank?).map(&:to_i).uniq
    ids.presence
  end

  def candidate_rows
    selected_locations = selected_template_locations
    selected_locations_by_id = selected_locations.index_by(&:id)

    selected_template_items.flat_map do |item|
      item_locations_for(item, selected_locations, selected_locations_by_id)
        .map { |location| { item: item, location: location } }
    end.sort_by { |row| [ row.fetch(:location).name.to_s, row.fetch(:item).position, row.fetch(:item).task_name.to_s ] }
  end

  def selected_template_locations
    locations = @template.pm_template_locations.active.includes(:location).order(:position, :id).map(&:location)
    return locations unless @location_ids

    locations.select { |location| @location_ids.include?(location.id) }
  end

  def selected_template_items
    items = @template.pm_template_items.active.includes(pm_template_item_locations: :location).order(:position, :id)
    items = items.where(id: @item_ids) if @item_ids
    items.where(frequency: @frequency_filters).to_a
  end

  def item_locations_for(item, selected_locations, selected_locations_by_id)
    restricted_locations = item.pm_template_item_locations.select(&:active?).filter_map(&:location)
    applicable_locations = restricted_locations.presence || selected_locations
    applicable_locations.select { |location| selected_locations_by_id.key?(location.id) }
  end

  def preview_row(row, duplicate_lookup)
    item = row.fetch(:item)
    location = row.fetch(:location)
    duplicate = duplicate_pm_task?(row, duplicate_lookup)
    {
      location_id: location.id,
      location: location.name,
      region: location.region,
      item_id: item.id,
      task_name: item.task_name,
      trade_category: item.trade_category,
      frequency: item.frequency,
      estimated_minutes: item.estimated_minutes,
      due_on: @due_on.iso8601,
      duplicate: duplicate,
      status: duplicate ? "duplicate" : "new"
    }
  end

  def summary_for(rows, duplicate_lookup)
    duplicates = rows.count { |row| duplicate_pm_task?(row, duplicate_lookup) }
    {
      candidate_count: rows.length,
      new_count: rows.length - duplicates,
      duplicate_count: duplicates,
      station_count: rows.map { |row| row.fetch(:location).id }.uniq.length,
      item_count: rows.map { |row| row.fetch(:item).id }.uniq.length,
      frequencies: @frequency_filters
    }
  end

  def create_pm_task_with_audit!(row)
    pm_task = nil

    ApplicationRecord.transaction(requires_new: true) do
      pm_task = PmTask.create!(pm_task_attributes(row))
      if @user
        AuditEvent.record!(
          action: "pm_task.created",
          record: pm_task,
          user: @user,
          metadata: audit_metadata(pm_task, row).merge(source: "pm_template_generation")
        )
      end
    end

    pm_task
  end

  def pm_task_attributes(row)
    item = row.fetch(:item)
    location = row.fetch(:location)
    {
      client: @template.client,
      location: location,
      pm_template: @template,
      pm_template_item: item,
      task_name: item.task_name,
      trade_category: item.trade_category,
      frequency: item.frequency,
      scheduled_date: @due_on,
      due_on: @due_on,
      period_start: @period_start,
      period_end: @period_end,
      estimated_minutes: item.estimated_minutes,
      status: "pending",
      notes: item.notes.presence,
      source_file: "pm_template: #{@template.name}"
    }
  end

  def duplicate_lookup_for(rows)
    return empty_duplicate_lookup if rows.empty?

    item_ids = rows.map { |row| row.fetch(:item).id }.uniq
    location_ids = rows.map { |row| row.fetch(:location).id }.uniq
    task_names = rows.map { |row| task_name_key(row.fetch(:item).task_name) }.uniq

    {
      template: template_duplicate_keys(item_ids, location_ids),
      legacy: legacy_duplicate_keys(location_ids, task_names)
    }
  end

  def empty_duplicate_lookup
    { template: Set.new, legacy: Set.new }
  end

  def template_duplicate_keys(item_ids, location_ids)
    PmTask.where(pm_template_item_id: item_ids, location_id: location_ids, period_start: @period_start)
      .pluck(:pm_template_item_id, :location_id)
      .map { |item_id, location_id| [ item_id, location_id ] }
      .to_set
  end

  def legacy_duplicate_keys(location_ids, task_names)
    PmTask.for_month(@period_start)
      .where(location_id: location_ids)
      .where("LOWER(task_name) IN (:task_names)", task_names: task_names)
      .pluck(:location_id, Arel.sql("LOWER(task_name)"))
      .map { |location_id, task_name| [ location_id, task_name.to_s ] }
      .to_set
  end

  def duplicate_pm_task?(row, duplicate_lookup)
    duplicate_lookup.fetch(:template).include?(template_duplicate_key(row)) || duplicate_lookup.fetch(:legacy).include?(legacy_duplicate_key(row))
  end

  def remember_duplicate(row, duplicate_lookup)
    duplicate_lookup.fetch(:template).add(template_duplicate_key(row))
    duplicate_lookup.fetch(:legacy).add(legacy_duplicate_key(row))
  end

  def template_duplicate_key(row)
    [ row.fetch(:item).id, row.fetch(:location).id ]
  end

  def legacy_duplicate_key(row)
    [ row.fetch(:location).id, task_name_key(row.fetch(:item).task_name) ]
  end

  def task_name_key(task_name)
    task_name.to_s.downcase
  end

  def duplicate_payload(row, index)
    item = row.fetch(:item)
    location = row.fetch(:location)
    {
      index: index,
      client: @template.client.name,
      location: location.name,
      task_name: item.task_name,
      scheduled_date: @due_on
    }
  end

  def audit_metadata(pm_task, row)
    item = row.fetch(:item)
    {
      template: @template.name,
      task_name: pm_task.task_name,
      location: pm_task.location.name,
      scheduled_date: pm_task.scheduled_date,
      due_on: pm_task.due_on,
      period_start: pm_task.period_start,
      period_end: pm_task.period_end,
      frequency: item.frequency,
      estimated_minutes: item.estimated_minutes
    }
  end
end
