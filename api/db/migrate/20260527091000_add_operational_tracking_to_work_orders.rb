class AddOperationalTrackingToWorkOrders < ActiveRecord::Migration[8.1]
  def change
    add_reference :work_orders, :service_line, foreign_key: true
    add_column :work_orders, :pa_project, :boolean, null: false, default: false
    add_column :work_orders, :pa_project_notes, :text
    add_column :work_orders, :corrective_maintenance, :boolean, null: false, default: false
    add_column :work_orders, :estimate_required, :boolean, null: false, default: false

    add_index :work_orders, :pa_project
    add_index :work_orders, :corrective_maintenance
    add_index :work_orders, :estimate_required
  end
end
