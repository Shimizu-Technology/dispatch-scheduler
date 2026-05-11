class CreateTechnicianAvailabilities < ActiveRecord::Migration[8.1]
  def change
    create_table :technician_availabilities do |t|
      t.references :technician, null: false, foreign_key: true
      t.date :date
      t.string :status
      t.string :reason

      t.timestamps
    end
  end
end
