class DispatchItemTechnician < ApplicationRecord
  belongs_to :dispatch_item
  belongs_to :technician

  validates :technician_name, presence: true
end
