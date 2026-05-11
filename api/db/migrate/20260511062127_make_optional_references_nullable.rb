class MakeOptionalReferencesNullable < ActiveRecord::Migration[8.1]
  def change
    change_column_null :work_orders, :team_id, true
    change_column_null :dispatch_items, :work_order_id, true
    change_column_null :dispatch_items, :pm_task_id, true
  end
end
