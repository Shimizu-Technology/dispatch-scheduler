class Team < ApplicationRecord
  has_many :team_memberships, dependent: :destroy
  has_many :team_daily_overrides, dependent: :destroy
  has_many :technicians, through: :team_memberships
  has_many :work_orders, dependent: :nullify
  has_many :dispatch_items, dependent: :nullify

  def technicians_for_date(date = Date.current)
    scope = daily_override?(date) ? team_memberships.where(date: date) : team_memberships.where(date: nil)
    Technician.where(id: scope.select(:technician_id)).distinct
  end

  def daily_override?(date = Date.current)
    team_daily_overrides.where(date: date).exists? || team_memberships.where(date: date).exists?
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
