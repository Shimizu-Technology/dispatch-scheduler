class Technician < ApplicationRecord
  has_many :technician_skills, dependent: :destroy
  has_many :technician_availabilities, dependent: :destroy
  has_many :team_memberships, dependent: :destroy
  has_many :teams, through: :team_memberships

  scope :active, -> { where(active: true) }

  def available_on?(date)
    active? && technician_availabilities.where(date: date, status: "unavailable").none?
  end
end
