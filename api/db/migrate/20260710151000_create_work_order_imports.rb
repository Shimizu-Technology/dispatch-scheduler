class CreateWorkOrderImports < ActiveRecord::Migration[8.1]
  def change
    create_table :work_order_imports do |t|
      t.references :user, null: false, foreign_key: true
      t.string :source_kind, null: false
      t.string :source_filename
      t.string :source_content_type
      t.string :source_sha256, null: false
      t.text :source_text
      t.text :raw_response
      t.string :extraction_model
      t.string :status, null: false, default: "pending"
      t.datetime :extracted_at, null: false

      t.timestamps
    end

    add_index :work_order_imports, [ :status, :created_at ]
    add_index :work_order_imports, :source_sha256

    create_table :work_order_import_items do |t|
      t.references :work_order_import, null: false, foreign_key: true
      t.references :work_order, null: true, foreign_key: true
      t.references :reviewed_by, null: true, foreign_key: { to_table: :users }
      t.integer :position, null: false, default: 0
      t.json :extracted_data, null: false, default: {}
      t.string :status, null: false, default: "pending"
      t.datetime :reviewed_at

      t.timestamps
    end

    add_index :work_order_import_items, [ :work_order_import_id, :position ], unique: true
    add_index :work_order_import_items, [ :status, :created_at ]
  end
end
