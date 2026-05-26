class AddArchivedAtToWorkOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :work_orders, :archived_at, :datetime
    add_index :work_orders, :archived_at
  end
end
