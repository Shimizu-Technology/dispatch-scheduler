class Team < ApplicationRecord
  has_many :team_memberships, dependent: :destroy
  has_many :technicians, through: :team_memberships
  has_many :work_orders, dependent: :nullify
  has_many :dispatch_items, dependent: :nullify

  def has_driver?(date = Date.current)
    technicians.joins("LEFT JOIN technician_availabilities ON technician_availabilities.technician_id = technicians.id AND technician_availabilities.date = #{ActiveRecord::Base.connection.quote(date)}")
      .where(is_driver: true, active: true)
      .where("technician_availabilities.id IS NULL OR technician_availabilities.status != 'unavailable'")
      .exists?
  end

  def skills
    TechnicianSkill.where(technician_id: technicians.select(:id)).distinct.pluck(:skill)
  end
end
