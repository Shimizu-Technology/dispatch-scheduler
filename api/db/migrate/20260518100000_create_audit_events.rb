class CreateAuditEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :audit_events do |t|
      t.references :user, foreign_key: true
      t.string :action, null: false
      t.string :record_type, null: false
      t.integer :record_id
      t.text :metadata
      t.datetime :occurred_at, null: false
      t.timestamps

      t.index [ :record_type, :record_id ]
      t.index :action
      t.index :occurred_at
    end
  end
end
