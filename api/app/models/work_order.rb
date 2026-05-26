class WorkOrder < ApplicationRecord
  belongs_to :client
  belongs_to :location
  belongs_to :team, optional: true
  belongs_to :service_line, optional: true
  has_many :dispatch_items, dependent: :nullify

  STATUSES = %w[new needs_assessment approved scheduled in_progress carry_over waiting_for_parts waiting_for_approval completed closed cancelled].freeze
  CLOSED_STATUSES = %w[completed closed cancelled].freeze
  BLOCKED_STATUSES = %w[waiting_for_parts waiting_for_approval].freeze

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
    { "P1" => 0, "Level 1" => 0, "P2" => 1, "P3" => 2, "P4" => 3 }.fetch(normalized_priority.presence || priority, 4)
  end
end
