class CreateDispatchItems < ActiveRecord::Migration[8.1]
  def change
    create_table :dispatch_items do |t|
      t.references :dispatch_schedule, null: false, foreign_key: true
      t.references :work_order, null: false, foreign_key: true
      t.references :pm_task, null: false, foreign_key: true
      t.references :team, null: false, foreign_key: true
      t.integer :order_index
      t.time :scheduled_time
      t.text :notes

      t.timestamps
    end
  end
end
