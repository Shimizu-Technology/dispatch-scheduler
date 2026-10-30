class AddWorkOrderLockVersion < ActiveRecord::Migration[8.1]
  def change
    add_column :work_orders, :lock_version, :integer, default: 0, null: false
  end
end
