class DispatchItem < ApplicationRecord
  belongs_to :dispatch_schedule
  belongs_to :work_order, optional: true
  belongs_to :pm_task, optional: true
  belongs_to :team

  def schedulable
    work_order || pm_task
  end
end
