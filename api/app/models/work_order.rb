class WorkOrder < ApplicationRecord
  belongs_to :client
  belongs_to :location
  belongs_to :team, optional: true
  has_many :dispatch_items, dependent: :nullify

  CLOSED_STATUSES = %w[completed closed cancelled].freeze
  BLOCKED_STATUSES = %w[waiting_for_parts waiting_for_approval].freeze

  scope :open, -> { where.not(status: CLOSED_STATUSES) }
  scope :dispatchable, -> { open.where.not(status: BLOCKED_STATUSES) }

  def urgent_rank
    { "P1" => 0, "Level 1" => 0, "P2" => 1, "P3" => 2, "P4" => 3 }.fetch(normalized_priority.presence || priority, 4)
  end
end
