class DispatchSchedule < ApplicationRecord
  STATUSES = %w[draft finalized sent].freeze

  has_many :dispatch_items, -> { order(:team_id, :order_index) }, dependent: :destroy
  belongs_to :finalized_by_user, class_name: "User", optional: true
  belongs_to :sent_by_user, class_name: "User", optional: true

  validates :status, inclusion: { in: STATUSES }, allow_blank: true

  def draft?
    status == "draft"
  end

  def finalized?
    status == "finalized"
  end

  def sent?
    status == "sent"
  end

  def locked?
    finalized? || sent?
  end

  def finalize!(user)
    update!(status: "finalized", finalized_at: Time.current, finalized_by_user: user)
  end

  def mark_sent!(user)
    timestamp = Time.current
    self.finalized_at ||= timestamp
    self.finalized_by_user ||= user
    update!(status: "sent", sent_at: timestamp, sent_by_user: user)
  end

  def reopen!
    update!(status: "draft", finalized_at: nil, sent_at: nil, finalized_by_user: nil, sent_by_user: nil)
  end
end
