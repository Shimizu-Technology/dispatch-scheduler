class AddJcfTimeFieldsToPmTasks < ActiveRecord::Migration[8.1]
  def change
    add_column :pm_tasks, :time_in_at, :datetime
    add_column :pm_tasks, :time_out_at, :datetime
  end
end
