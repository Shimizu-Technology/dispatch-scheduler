class CreateWorkOrders < ActiveRecord::Migration[8.1]
  def change
    create_table :work_orders do |t|
      t.references :client, null: false, foreign_key: true
      t.references :location, null: false, foreign_key: true
      t.references :team, null: false, foreign_key: true
      t.string :external_id
      t.string :source
      t.string :source_reference
      t.string :title
      t.text :description
      t.string :priority
      t.string :normalized_priority
      t.string :status
      t.string :original_status_text
      t.string :trade_category
      t.datetime :requested_at
      t.datetime :response_due_at
      t.datetime :repair_due_at
      t.date :scheduled_date
      t.decimal :estimated_hours
      t.text :notes

      t.timestamps
    end
  end
end
