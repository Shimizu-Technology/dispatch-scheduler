class WorkOrder < ApplicationRecord
  belongs_to :client
  belongs_to :location
  belongs_to :team, optional: true

  scope :open, -> { where.not(status: %w[completed closed]) }

  def urgent_rank
    { "P1" => 0, "Level 1" => 0, "P2" => 1, "P3" => 2, "P4" => 3 }.fetch(normalized_priority.presence || priority, 4)
  end
end
