class DispatchItem < ApplicationRecord
  OUTCOME_STATUSES = %w[pending completed carry_over waiting_parts waiting_approval unable_to_access cancelled].freeze

  belongs_to :dispatch_schedule
  belongs_to :work_order, optional: true
  belongs_to :pm_task, optional: true
  belongs_to :team
  has_many :dispatch_item_technicians, -> { order(:position, :id) }, dependent: :destroy
  has_many :assigned_technicians, through: :dispatch_item_technicians, source: :technician

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

  def snapshot_technicians!
    return unless dispatch_schedule && team

    ApplicationRecord.transaction(requires_new: true) do
      dispatch_item_technicians.delete_all
      team.available_technicians(dispatch_schedule.date).order(:name).each_with_index do |technician, index|
        dispatch_item_technicians.create!(
          technician: technician,
          technician_name: technician.name,
          primary_trade: technician.primary_trade,
          is_driver: technician.is_driver,
          position: index
        )
      end
    end
  end
end
