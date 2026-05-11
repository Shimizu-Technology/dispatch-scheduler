class CreateTechnicianSkills < ActiveRecord::Migration[8.1]
  def change
    create_table :technician_skills do |t|
      t.references :technician, null: false, foreign_key: true
      t.string :skill

      t.timestamps
    end
  end
end
