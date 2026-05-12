class User < ApplicationRecord
  ROLES = %w[admin dispatcher viewer].freeze

  validates :clerk_id, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: ROLES }

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
    admin? || dispatcher?
  end

  def display_name
    name.presence || email.to_s.split("@").first
  end

  private

  def normalize_email
    self.email = email.to_s.downcase.strip
  end
end
