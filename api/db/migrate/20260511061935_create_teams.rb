class CreateTeams < ActiveRecord::Migration[8.1]
  def change
    create_table :teams do |t|
      t.string :name
      t.string :region_preference
      t.text :notes

      t.timestamps
    end
  end
end
