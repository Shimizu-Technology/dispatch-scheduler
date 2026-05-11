class PmTask < ApplicationRecord
  belongs_to :client
  belongs_to :location
end
