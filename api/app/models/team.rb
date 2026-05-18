class Team < ApplicationRecord
  has_many :team_memberships, dependent: :destroy
  has_many :technicians, through: :team_memberships
  has_many :work_orders, dependent: :nullify
  has_many :dispatch_items, dependent: :nullify

  def technicians_for_date(date = Date.current)
    technicians
      .where("team_memberships.date IS NULL OR team_memberships.date = ?", date)
      .distinct
  end

  def available_technicians(date = Date.current)
    technicians_for_date(date)
      .joins("LEFT JOIN technician_availabilities ON technician_availabilities.technician_id = technicians.id AND technician_availabilities.date = #{ActiveRecord::Base.connection.quote(date)}")
      .where(active: true)
      .where("technician_availabilities.id IS NULL OR technician_availabilities.status != 'unavailable'")
      .distinct
  end

  def has_driver?(date = Date.current)
    available_technicians(date).where(is_driver: true).exists?
  end

  def skills(date = Date.current)
    TechnicianSkill.where(technician_id: available_technicians(date).select(:id)).distinct.pluck(:skill)
  end
end
