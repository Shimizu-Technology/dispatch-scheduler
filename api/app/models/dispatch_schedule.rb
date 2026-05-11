class DispatchSchedule < ApplicationRecord
  has_many :dispatch_items, -> { order(:team_id, :order_index) }, dependent: :destroy
end
