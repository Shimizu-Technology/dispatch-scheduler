class Client < ApplicationRecord
  has_many :locations, dependent: :destroy
  has_many :work_orders, dependent: :destroy
  has_many :pm_tasks, dependent: :destroy
end
