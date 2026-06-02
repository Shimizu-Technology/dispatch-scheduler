class PmTask < ApplicationRecord
  STATUSES = %w[pending scheduled completed deferred].freeze

  belongs_to :client
  belongs_to :location

  validates :task_name, :scheduled_date, :trade_category, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :deferred_until, presence: true, if: :deferred?

  scope :for_month, ->(date) { where(scheduled_date: date.beginning_of_month..date.end_of_month) }
  scope :incomplete, -> { where.not(status: "completed") }
  scope :dispatchable_for_date, lambda { |date|
    where(status: %w[pending scheduled])
      .where("scheduled_date = :date OR (deferred_until IS NOT NULL AND deferred_until <= :date)", date: date)
  }
  scope :opportunistic_for_locations, lambda { |date, location_ids|
    for_month(date).where(location_id: location_ids, status: "pending")
  }

  def completed?
    status == "completed"
  end

  def deferred?
    status == "deferred"
  end
end
