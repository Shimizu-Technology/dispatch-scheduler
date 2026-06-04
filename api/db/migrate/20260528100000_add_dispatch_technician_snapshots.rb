class AddDispatchTechnicianSnapshots < ActiveRecord::Migration[8.1]
  def change
    add_column :work_orders, :required_technician_count, :integer, null: false, default: 1

    create_table :dispatch_item_technicians do |t|
      t.references :dispatch_item, null: false, foreign_key: true
      t.references :technician, null: false, foreign_key: true
      t.string :technician_name, null: false
      t.string :primary_trade
      t.boolean :is_driver, null: false, default: false
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :dispatch_item_technicians, [ :dispatch_item_id, :technician_id ], unique: true, name: "index_dispatch_item_technicians_unique_assignment"
    add_index :dispatch_item_technicians, [ :technician_id, :position ]
  end
end
