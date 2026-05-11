class CreateTechnicians < ActiveRecord::Migration[8.1]
  def change
    create_table :technicians do |t|
      t.string :name
      t.string :primary_trade
      t.boolean :is_driver
      t.boolean :active

      t.timestamps
    end
  end
end
