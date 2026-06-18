class PmTemplate < ApplicationRecord
  belongs_to :client
  belongs_to :service_line, optional: true
  has_many :pm_template_locations, dependent: :destroy
  has_many :locations, through: :pm_template_locations
  has_many :pm_template_items, dependent: :destroy
  has_many :pm_tasks, dependent: :nullify

  validates :name, presence: true, uniqueness: { scope: :client_id }

  scope :active, -> { where(active: true) }

  def active_locations
    pm_template_locations.active.includes(:location).order(:position, :id).map(&:location)
  end

  def active_items
    pm_template_items.active.order(:position, :id)
  end
end
