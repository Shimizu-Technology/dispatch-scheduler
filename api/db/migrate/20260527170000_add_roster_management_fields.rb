class AddRosterManagementFields < ActiveRecord::Migration[8.1]
  def up
    add_column :teams, :active, :boolean, default: true, null: false
    add_column :teams, :archived_at, :datetime
    add_column :teams, :crew_type, :string, default: "general", null: false

    add_column :technicians, :notes, :text
    change_column_default :technicians, :active, from: nil, to: true
    change_column_null :technicians, :active, false, true
    change_column_default :technicians, :is_driver, from: nil, to: false
    change_column_null :technicians, :is_driver, false, false

    create_table :team_service_line_preferences do |t|
      t.references :team, null: false, foreign_key: true
      t.references :service_line, null: false, foreign_key: true

      t.timestamps
    end

    deduplicate_roster_rows

    add_index :teams, :active
    add_index :teams, :archived_at
    add_index :team_memberships, [ :team_id, :technician_id ], unique: true, where: "date IS NULL", name: "index_team_memberships_unique_default"
    add_index :team_memberships, [ :team_id, :technician_id, :date ], unique: true, where: "date IS NOT NULL", name: "index_team_memberships_unique_daily"
    add_index :technician_skills, [ :technician_id, :skill ], unique: true
    add_index :technician_availabilities, [ :technician_id, :date ], unique: true, name: "index_technician_availabilities_unique_tech_date"
    add_index :team_service_line_preferences, [ :team_id, :service_line_id ], unique: true, name: "index_team_service_line_preferences_unique"
  end

  def down
    remove_index :team_service_line_preferences, name: "index_team_service_line_preferences_unique"
    remove_index :technician_availabilities, name: "index_technician_availabilities_unique_tech_date"
    remove_index :technician_skills, [ :technician_id, :skill ]
    remove_index :team_memberships, name: "index_team_memberships_unique_daily"
    remove_index :team_memberships, name: "index_team_memberships_unique_default"
    remove_index :teams, :archived_at
    remove_index :teams, :active

    drop_table :team_service_line_preferences

    change_column_null :technicians, :is_driver, true
    change_column_default :technicians, :is_driver, from: false, to: nil
    change_column_null :technicians, :active, true
    change_column_default :technicians, :active, from: true, to: nil
    remove_column :technicians, :notes

    remove_column :teams, :crew_type
    remove_column :teams, :archived_at
    remove_column :teams, :active
  end

  private

  def deduplicate_roster_rows
    execute <<~SQL.squish
      DELETE FROM team_memberships
      WHERE date IS NULL
        AND id NOT IN (
          SELECT MIN(id)
          FROM team_memberships
          WHERE date IS NULL
          GROUP BY team_id, technician_id
        )
    SQL

    execute <<~SQL.squish
      DELETE FROM team_memberships
      WHERE date IS NOT NULL
        AND id NOT IN (
          SELECT MIN(id)
          FROM team_memberships
          WHERE date IS NOT NULL
          GROUP BY team_id, technician_id, date
        )
    SQL

    execute <<~SQL.squish
      DELETE FROM technician_skills
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM technician_skills
        GROUP BY technician_id, skill
      )
    SQL

    execute <<~SQL.squish
      DELETE FROM technician_availabilities
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM technician_availabilities
        GROUP BY technician_id, date
      )
    SQL
  end
end
