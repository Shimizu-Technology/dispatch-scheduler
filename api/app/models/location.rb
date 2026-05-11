class Location < ApplicationRecord
  belongs_to :client
  has_many :work_orders, dependent: :destroy
  has_many :pm_tasks, dependent: :destroy
end
