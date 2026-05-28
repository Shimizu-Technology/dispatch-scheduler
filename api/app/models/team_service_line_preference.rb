class TeamServiceLinePreference < ApplicationRecord
  belongs_to :team
  belongs_to :service_line
end
