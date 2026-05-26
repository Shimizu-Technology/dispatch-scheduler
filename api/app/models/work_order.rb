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

  scope :active_queue, -> { where(archived_at: nil) }
  scope :archived, -> { where.not(archived_at: nil) }
  scope :open, -> { where.not(status: CLOSED_STATUSES) }
  scope :dispatchable, -> { active_queue.open.where.not(status: BLOCKED_STATUSES) }

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
    open? && reported_at.blank? && assessment_due_at.blank? && repair_due_at.blank?
  end

  def sla_dispatchable_on?(date)
    return true if scheduled_date == date
    return true if sla_due_at.blank?

    sla_due_at <= date.end_of_day
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
    self.reported_at ||= requested_at || created_at || Time.current
    self.requested_at ||= reported_at

    windows = PRIORITY_SLA_WINDOWS[priority_key]
    return unless windows && reported_at.present?
    return unless sla_due_dates_need_refresh?

    self.assessment_due_at = reported_at + windows.fetch(:assessment)
    self.response_due_at = assessment_due_at
    self.repair_due_at = reported_at + windows.fetch(:repair)
  end

  def sla_due_dates_need_refresh?
    assessment_due_at.blank? || repair_due_at.blank? || will_save_change_to_reported_at? || will_save_change_to_requested_at? || will_save_change_to_priority? || will_save_change_to_normalized_priority?
  end
end
