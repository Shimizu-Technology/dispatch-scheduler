class AddArchiveFieldsToPmTasks < ActiveRecord::Migration[8.1]
  def change
    add_column :pm_tasks, :archived_at, :datetime
    add_column :pm_tasks, :archive_reason, :text
    add_index :pm_tasks, :archived_at
  end
end
