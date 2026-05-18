class CreateTeamDailyOverrides < ActiveRecord::Migration[8.1]
  def change
    create_table :team_daily_overrides do |t|
      t.references :team, null: false, foreign_key: true
      t.date :date, null: false
      t.timestamps

      t.index [ :team_id, :date ], unique: true
    end
  end
end
