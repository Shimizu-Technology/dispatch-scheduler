class PmTask < ApplicationRecord
  STATUSES = %w[pending scheduled completed deferred].freeze

  belongs_to :client
  belongs_to :location
  belongs_to :pm_template, optional: true
  belongs_to :pm_template_item, optional: true
  has_many :status_events, class_name: "PmTaskStatusEvent", dependent: :destroy

  after_create :record_initial_status_event
  after_update :record_status_change, if: :saved_change_to_status?

  validates :task_name, :scheduled_date, :trade_category, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :deferred_until, presence: true, if: :deferred?
  validate :time_out_after_time_in

  scope :active, -> { where(archived_at: nil) }
  scope :archived, -> { where.not(archived_at: nil) }
  scope :for_month, ->(date) { where("COALESCE(period_start, scheduled_date) <= ? AND COALESCE(period_end, scheduled_date) >= ?", date.end_of_month, date.beginning_of_month) }
  scope :incomplete, -> { active.where.not(status: "completed") }
  scope :dispatchable_for_date, lambda { |date|
    active
      .where(status: %w[pending scheduled])
      .where("scheduled_date = :date OR (deferred_until IS NOT NULL AND deferred_until <= :date)", date: date)
  }
  scope :opportunistic_for_locations, lambda { |date, location_ids|
    active.for_month(date).where(location_id: location_ids, status: "pending")
  }

  def completed?
    status == "completed"
  end

  def archived?
    archived_at.present?
  end

  def deferred?
    status == "deferred"
  end

  def actual_duration_minutes
    return nil unless time_in_at.present? && time_out_at.present?

    ((time_out_at - time_in_at) / 60).round
  end

  private

  def record_initial_status_event
    status_events.create!(
      user: Current.user,
      from_status: nil,
      to_status: status,
      source: "application",
      occurred_at: created_at || Time.current
    )
  end

  def record_status_change
    previous_status, next_status = saved_change_to_status
    status_events.create!(
      user: Current.user,
      from_status: previous_status,
      to_status: next_status,
      source: "application",
      occurred_at: updated_at || Time.current
    )
  end

  def time_out_after_time_in
    return if time_in_at.blank? || time_out_at.blank? || time_out_at >= time_in_at

    errors.add(:time_out_at, "can't be before time in")
  end
end
