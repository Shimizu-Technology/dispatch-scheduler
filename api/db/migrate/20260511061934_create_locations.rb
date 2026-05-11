class CreateLocations < ActiveRecord::Migration[8.1]
  def change
    create_table :locations do |t|
      t.references :client, null: false, foreign_key: true
      t.string :name
      t.string :region
      t.string :address
      t.text :notes

      t.timestamps
    end
  end
end
