class ServiceLine < ApplicationRecord
  has_many :work_orders, dependent: :nullify

  validates :name, presence: true, uniqueness: { case_sensitive: false }
  validates :position, numericality: { only_integer: true }

  scope :active, -> { where(active: true) }
  scope :ordered, -> { order(:position, :name) }
end
