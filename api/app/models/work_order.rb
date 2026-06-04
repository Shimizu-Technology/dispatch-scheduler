class WorkOrder < ApplicationRecord
  belongs_to :client
  belongs_to :location
  belongs_to :team, optional: true
  belongs_to :service_line, optional: true
  has_many :dispatch_items, dependent: :nullify

  STATUSES = %w[new needs_assessment approved scheduled in_progress carry_over waiting_for_parts waiting_for_approval completed closed cancelled].freeze
  CLOSED_STATUSES = %w[completed closed cancelled].freeze
  BLOCKED_STATUSES = %w[waiting_for_parts waiting_for_approval].freeze

  PRIORITY_SLA_WINDOWS = {
    "P1" => { assessment: 2.hours, repair: 4.hours },
    "Level 1" => { assessment: 2.hours, repair: 4.hours },
    "P2" => { assessment: 2.hours, repair: 4.hours },
    "P3" => { assessment: 24.hours, repair: 48.hours },
    "P4" => { assessment: 4.days, repair: 8.days }
  }.freeze
  ASSESSMENT_STATUSES = %w[new needs_assessment].freeze

  before_validation :normalize_sla_due_dates

  validates :status, inclusion: { in: STATUSES }
  validates :required_technician_count, numericality: { only_integer: true, greater_than_or_equal_to: 1 }

  scope :active_queue, -> { where(archived_at: nil) }
  scope :archived, -> { where.not(archived_at: nil) }
  scope :open, -> { where.not(status: CLOSED_STATUSES) }
  scope :dispatchable, -> { active_queue.open.where.not(status: BLOCKED_STATUSES) }
  scope :sla_missing, -> { active_queue.open.where(reported_at: nil, assessment_due_at: nil, response_due_at: nil, repair_due_at: nil) }
  scope :sla_overdue_at, lambda { |reference_time = Time.current|
    active_queue.open.where(sanitize_sql_array([ "#{sla_due_sql} < ?", reference_time ]))
  }
  scope :sla_due_soon_at, lambda { |reference_time = Time.current, window: 24.hours|
    active_queue.open.where(sanitize_sql_array([ "#{sla_due_sql} >= ? AND #{sla_due_sql} <= ?", reference_time, reference_time + window ]))
  }
  scope :sla_dispatchable_for_date, lambda { |date|
    end_of_day = date.end_of_day
    assessment_statuses = quoted_assessment_statuses
    pa_project_false = false
    sla_due_sql = sanitize_sql_array([
      <<~SQL.squish,
        scheduled_date = :date
        OR (
          scheduled_date IS NULL
          AND COALESCE(pa_project, :pa_project_false) = :pa_project_false
          AND (
            (
              status IN (#{assessment_statuses})
              AND assessed_at IS NULL
              AND COALESCE(assessment_due_at, response_due_at, repair_due_at) <= :end_of_day
            )
            OR (
              (status NOT IN (#{assessment_statuses}) OR assessed_at IS NOT NULL)
              AND COALESCE(repair_due_at, assessment_due_at, response_due_at) <= :end_of_day
            )
            OR (
              /* Keep legacy/unclassified work visible until a dispatcher supplies
                 reported time/priority data that lets the SLA rules take over.
                 PA Projects stay in follow-up until a dispatcher explicitly dates them. */
              assessment_due_at IS NULL
              AND response_due_at IS NULL
              AND repair_due_at IS NULL
            )
          )
        )
      SQL
      { date: date, end_of_day: end_of_day, pa_project_false: pa_project_false }
    ])

    where(sla_due_sql)
  }

  def self.quoted_assessment_statuses
    ASSESSMENT_STATUSES.map { |status| connection.quote(status) }.join(", ")
  end

  def self.sla_due_sql
    <<~SQL.squish
      CASE
        WHEN status IN (#{quoted_assessment_statuses}) AND assessed_at IS NULL
          THEN COALESCE(assessment_due_at, response_due_at, repair_due_at)
        ELSE COALESCE(repair_due_at, assessment_due_at, response_due_at)
      END
    SQL
  end

  def archived?
    archived_at.present?
  end

  def open?
    CLOSED_STATUSES.exclude?(status)
  end

  def urgent_rank
    { "P1" => 0, "Level 1" => 0, "P2" => 1, "P3" => 2, "P4" => 3 }.fetch(priority_key, 4)
  end

  def priority_key
    normalized_priority.presence || priority
  end

  def sla_due_at
    if ASSESSMENT_STATUSES.include?(status) && assessed_at.blank?
      assessment_due_at || response_due_at || repair_due_at
    else
      repair_due_at || assessment_due_at || response_due_at
    end
  end

  def sla_overdue?(reference_time = Time.current)
    due_at = sla_due_at
    due_at.present? && due_at < reference_time && open?
  end

  def sla_due_soon?(reference_time = Time.current, window: 24.hours)
    due_at = sla_due_at
    due_at.present? && due_at >= reference_time && due_at <= reference_time + window && open?
  end

  def sla_missing?
    open? && reported_at.blank? && assessment_due_at.blank? && response_due_at.blank? && repair_due_at.blank?
  end

  def sla_sort_key(reference_date)
    due_at = sla_due_at
    return [ 2, Time.zone.local(2999, 12, 31) ] if due_at.blank?

    reference_time = reference_date == Date.current ? Time.current : reference_date.end_of_day
    state_rank = due_at < reference_time ? 0 : 1
    [ state_rank, due_at ]
  end

  private

  def normalize_sla_due_dates
    self.reported_at ||= requested_at
    self.requested_at ||= reported_at

    windows = PRIORITY_SLA_WINDOWS[priority_key]
    return unless windows && reported_at.present?

    calculated_assessment_due_at = reported_at + windows.fetch(:assessment)
    calculated_repair_due_at = reported_at + windows.fetch(:repair)

    if assessment_due_at.blank? || previously_auto_calculated_due?(:assessment_due_at)
      self.assessment_due_at = calculated_assessment_due_at
    end

    if response_due_at.blank? || previously_auto_calculated_due?(:response_due_at)
      self.response_due_at = assessment_due_at || calculated_assessment_due_at
    end

    if repair_due_at.blank? || previously_auto_calculated_due?(:repair_due_at)
      self.repair_due_at = calculated_repair_due_at
    end
  end

  def previously_auto_calculated_due?(field)
    return false unless persisted?
    return false unless will_save_change_to_reported_at? || will_save_change_to_requested_at? || will_save_change_to_priority? || will_save_change_to_normalized_priority?

    old_reported_at = will_save_change_to_reported_at? ? reported_at_was : reported_at
    old_reported_at ||= will_save_change_to_requested_at? ? requested_at_was : requested_at
    old_priority_key = (will_save_change_to_normalized_priority? ? normalized_priority_was : normalized_priority).presence || (will_save_change_to_priority? ? priority_was : priority)
    old_windows = PRIORITY_SLA_WINDOWS[old_priority_key]
    old_value = public_send("#{field}_was")
    return false unless old_reported_at.present? && old_windows && old_value.present?

    expected_old_value = if field == :repair_due_at
      old_reported_at + old_windows.fetch(:repair)
    else
      old_reported_at + old_windows.fetch(:assessment)
    end
    old_value.to_i == expected_old_value.to_i
  end
end
