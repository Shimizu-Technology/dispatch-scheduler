class WorkOrderImportItem < ApplicationRecord
  STATUSES = %w[pending approved rejected].freeze

  belongs_to :work_order_import
  belongs_to :work_order, optional: true
  belongs_to :reviewed_by, class_name: "User", optional: true

  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :status, inclusion: { in: STATUSES }
  validates :position, uniqueness: { scope: :work_order_import_id }
  validate :review_state_is_consistent

  scope :owned_by, ->(user) { where(work_order_import_id: WorkOrderImport.owned_by(user).select(:id)) }
  scope :pending_review, -> { where(status: "pending") }

  def approve!(work_order:, user:)
    raise ActiveRecord::RecordInvalid.new(self) unless status == "pending"

    update!(status: "approved", work_order: work_order, reviewed_by: user, reviewed_at: Time.current)
    work_order_import.refresh_status!
  end

  def reject!(user:)
    raise ActiveRecord::RecordInvalid.new(self) unless status == "pending"

    update!(status: "rejected", reviewed_by: user, reviewed_at: Time.current)
    work_order_import.refresh_status!
  end

  private

  def review_state_is_consistent
    if status == "approved" && work_order.blank?
      errors.add(:work_order, "must be linked when an import item is approved")
    elsif status == "rejected" && work_order.present?
      errors.add(:work_order, "must be blank when an import item is rejected")
    end

    return if status == "pending" || (reviewed_by.present? && reviewed_at.present?)

    errors.add(:reviewed_at, "and reviewer are required after review")
  end
end
