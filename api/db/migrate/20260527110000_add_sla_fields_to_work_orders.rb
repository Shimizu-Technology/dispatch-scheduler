class AddSlaFieldsToWorkOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :work_orders, :reported_at, :datetime
    add_column :work_orders, :assessment_due_at, :datetime
    add_column :work_orders, :assessed_at, :datetime

    add_index :work_orders, :reported_at
    add_index :work_orders, :assessment_due_at
    add_index :work_orders, :repair_due_at
  end
end
