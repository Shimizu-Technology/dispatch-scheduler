class WorkOrderStatusEvent < ApplicationRecord
  belongs_to :work_order
  belongs_to :user, optional: true

  validates :to_status, inclusion: { in: WorkOrder::STATUSES }
  validates :occurred_at, presence: true
end
