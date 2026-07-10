class WorkOrderImport < ApplicationRecord
  STATUSES = %w[pending partially_reviewed completed rejected].freeze
  SOURCE_KINDS = %w[file pasted_text].freeze

  belongs_to :user
  has_many :items, class_name: "WorkOrderImportItem", dependent: :destroy
  has_one_attached :source_file

  validates :source_kind, inclusion: { in: SOURCE_KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :extracted_at, presence: true
  validates :source_sha256, presence: true
  validates :source_text, length: { maximum: WorkOrderOcrExtractor::MAX_TEXT_LENGTH }, if: -> { source_kind == "pasted_text" }

  scope :with_pending_items, -> { where(id: WorkOrderImportItem.pending_review.select(:work_order_import_id)) }

  def refresh_status!
    item_statuses = items.pluck(:status)
    next_status = if item_statuses.empty? || item_statuses.all?("pending")
      "pending"
    elsif item_statuses.all?("rejected")
      "rejected"
    elsif item_statuses.none?("pending")
      "completed"
    else
      "partially_reviewed"
    end
    update!(status: next_status) unless status == next_status
  end
end
