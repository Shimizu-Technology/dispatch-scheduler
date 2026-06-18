class PmTemplateLocation < ApplicationRecord
  belongs_to :pm_template
  belongs_to :location

  validates :location_id, uniqueness: { scope: :pm_template_id }

  scope :active, -> { where(active: true) }
end
