class AddOperationalFieldsToDispatchSchedules < ActiveRecord::Migration[8.1]
  def change
    add_column :dispatch_schedules, :finalized_at, :datetime
    add_column :dispatch_schedules, :sent_at, :datetime
    add_reference :dispatch_schedules, :finalized_by_user, foreign_key: { to_table: :users }
    add_reference :dispatch_schedules, :sent_by_user, foreign_key: { to_table: :users }
    add_index :dispatch_schedules, [ :date, :status ]
  end
end
