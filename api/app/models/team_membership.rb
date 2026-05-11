class TeamMembership < ApplicationRecord
  belongs_to :team
  belongs_to :technician
end
