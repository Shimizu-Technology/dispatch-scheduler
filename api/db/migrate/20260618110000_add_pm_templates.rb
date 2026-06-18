class AddPmTemplates < ActiveRecord::Migration[8.1]
  def change
    create_table :pm_templates do |t|
      t.references :client, null: false, foreign_key: true
      t.references :service_line, foreign_key: true
      t.string :name, null: false
      t.boolean :active, default: true, null: false
      t.text :notes
      t.timestamps
    end
    add_index :pm_templates, [ :client_id, :name ], unique: true
    add_index :pm_templates, [ :active, :name ]

    create_table :pm_template_locations do |t|
      t.references :pm_template, null: false, foreign_key: true
      t.references :location, null: false, foreign_key: true
      t.integer :position, default: 0, null: false
      t.boolean :active, default: true, null: false
      t.timestamps
    end
    add_index :pm_template_locations, [ :pm_template_id, :location_id ], unique: true
    add_index :pm_template_locations, [ :pm_template_id, :position ]

    create_table :pm_template_items do |t|
      t.references :pm_template, null: false, foreign_key: true
      t.string :task_name, null: false
      t.string :trade_category, null: false, default: "General"
      t.string :frequency, null: false, default: "monthly"
      t.integer :estimated_minutes, default: 45, null: false
      t.integer :position, default: 0, null: false
      t.boolean :active, default: true, null: false
      t.text :notes
      t.timestamps
    end
    add_index :pm_template_items, [ :pm_template_id, :position ]
    add_index :pm_template_items, [ :pm_template_id, :frequency ]
    add_index :pm_template_items, [ :pm_template_id, :task_name ], unique: true

    create_table :pm_template_item_locations do |t|
      t.references :pm_template_item, null: false, foreign_key: true
      t.references :location, null: false, foreign_key: true
      t.boolean :active, default: true, null: false
      t.timestamps
    end
    add_index :pm_template_item_locations, [ :pm_template_item_id, :location_id ], unique: true, name: "index_pm_template_item_locations_unique"

    add_reference :pm_tasks, :pm_template, foreign_key: true
    add_reference :pm_tasks, :pm_template_item, foreign_key: true
    add_column :pm_tasks, :period_start, :date
    add_column :pm_tasks, :period_end, :date
    add_column :pm_tasks, :due_on, :date
    add_column :pm_tasks, :estimated_minutes, :integer
    add_index :pm_tasks, [ :pm_template_item_id, :location_id, :period_start ], name: "index_pm_tasks_on_template_item_location_period"
    add_index :pm_tasks, :due_on
  end
end
