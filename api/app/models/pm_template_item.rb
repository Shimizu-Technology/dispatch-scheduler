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
    pm_template_item_locations.active.exists?
  end

  def applicable_locations
    if restricted_locations?
      pm_template_item_locations.active.includes(:location).map(&:location)
    else
      pm_template.active_locations
    end
  end
end
