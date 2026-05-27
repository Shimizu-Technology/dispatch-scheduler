class AddMonthWorkflowToPmTasks < ActiveRecord::Migration[8.1]
  def change
    add_column :pm_tasks, :status, :string, null: false, default: "pending"
    add_column :pm_tasks, :completed_at, :datetime
    add_column :pm_tasks, :deferred_until, :date
    add_column :pm_tasks, :notes, :text

    add_index :pm_tasks, :status
    add_index :pm_tasks, [ :scheduled_date, :status ]
    add_index :pm_tasks, :deferred_until
  end
end
