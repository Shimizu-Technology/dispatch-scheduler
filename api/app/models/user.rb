class User < ApplicationRecord
  ROLES = %w[admin dispatcher viewer].freeze
  INVITATION_STATUSES = %w[pending accepted].freeze

  belongs_to :invited_by, class_name: "User", optional: true
  has_many :sent_invitations, class_name: "User", foreign_key: :invited_by_id, dependent: :nullify, inverse_of: :invited_by

  validates :clerk_id, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: ROLES }
  validates :invitation_status, inclusion: { in: INVITATION_STATUSES }

  before_validation :normalize_email

  def admin?
    role == "admin"
  end

  def dispatcher?
    role == "dispatcher"
  end

  def viewer?
    role == "viewer"
  end

  def can_edit_dispatch?
    active? && (admin? || dispatcher?)
  end

  def invitation_pending?
    invitation_status == "pending"
  end

  def invitation_accepted?
    invitation_status == "accepted"
  end

  def mark_invitation_accepted!
    return if invitation_accepted? && invitation_accepted_at.present?

    update!(invitation_status: "accepted", invitation_accepted_at: Time.current)
  end

  def display_name
    name.presence || email.to_s.split("@").first
  end

  def auth_mode
    "clerk"
  end

  private

  def normalize_email
    self.email = email.to_s.downcase.strip
  end
end
