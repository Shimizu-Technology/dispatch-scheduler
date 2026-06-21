class PmTemplateItem < ApplicationRecord
  FREQUENCIES = %w[monthly quarterly biannual annual manual].freeze

  belongs_to :pm_template
  has_many :pm_template_item_locations, dependent: :destroy
  has_many :locations, through: :pm_template_item_locations
  has_many :pm_tasks, dependent: :nullify

  validates :task_name, presence: true, uniqueness: { scope: :pm_template_id }
  validates :trade_category, presence: true
  validates :frequency, inclusion: { in: FREQUENCIES }
  validates :estimated_minutes, numericality: { only_integer: true, greater_than: 0 }

  scope :active, -> { where(active: true) }

  def restricted_locations?
    active_location_assignments.any?
  end

  def applicable_locations
    assignments = active_location_assignments
    if assignments.any?
      assignments.map(&:location)
    else
      pm_template.active_locations
    end
  end

  private

  def active_location_assignments
    if association(:pm_template_item_locations).loaded?
      pm_template_item_locations.select(&:active?)
    else
      pm_template_item_locations.active.includes(:location)
    end
  end
end
