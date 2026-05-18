class TeamDailyOverride < ApplicationRecord
  belongs_to :team

  validates :date, presence: true
  validates :team_id, uniqueness: { scope: :date }
end
