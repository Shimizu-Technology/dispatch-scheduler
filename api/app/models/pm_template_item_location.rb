class PmTemplateItemLocation < ApplicationRecord
  belongs_to :pm_template_item
  belongs_to :location

  validates :location_id, uniqueness: { scope: :pm_template_item_id }

  scope :active, -> { where(active: true) }
end
