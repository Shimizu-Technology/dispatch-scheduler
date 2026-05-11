class CreatePmTasks < ActiveRecord::Migration[8.1]
  def change
    create_table :pm_tasks do |t|
      t.references :client, null: false, foreign_key: true
      t.references :location, null: false, foreign_key: true
      t.string :task_name
      t.string :trade_category
      t.string :frequency
      t.date :scheduled_date
      t.string :source_file

      t.timestamps
    end
  end
end
