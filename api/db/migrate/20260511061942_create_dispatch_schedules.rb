class CreateDispatchSchedules < ActiveRecord::Migration[8.1]
  def change
    create_table :dispatch_schedules do |t|
      t.date :date
      t.string :status

      t.timestamps
    end
  end
end
