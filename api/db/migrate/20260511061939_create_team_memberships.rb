class CreateTeamMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :team_memberships do |t|
      t.references :team, null: false, foreign_key: true
      t.references :technician, null: false, foreign_key: true
      t.date :date

      t.timestamps
    end
  end
end
