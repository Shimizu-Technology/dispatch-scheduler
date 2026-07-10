class PmTaskStatusEvent < ApplicationRecord
  belongs_to :pm_task
  belongs_to :user, optional: true

  validates :to_status, inclusion: { in: PmTask::STATUSES }
  validates :occurred_at, presence: true
end
