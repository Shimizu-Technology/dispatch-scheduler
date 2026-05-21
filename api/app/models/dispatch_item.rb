class DispatchItem < ApplicationRecord
  OUTCOME_STATUSES = %w[pending completed carry_over waiting_parts waiting_approval unable_to_access cancelled].freeze

  belongs_to :dispatch_schedule
  belongs_to :work_order, optional: true
  belongs_to :pm_task, optional: true
  belongs_to :team

  validates :outcome_status, inclusion: { in: OUTCOME_STATUSES }

  def schedulable
    work_order || pm_task
  end

  def outcome_complete?
    outcome_status == "completed"
  end

  def carry_over?
    outcome_status == "carry_over"
  end
end
