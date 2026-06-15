class AddFollowUpFieldsToWorkOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :work_orders, :parts_status, :string
    add_column :work_orders, :parts_ordered, :boolean, default: false, null: false
    add_column :work_orders, :parts_ordered_at, :datetime
    add_column :work_orders, :parts_eta, :date
    add_column :work_orders, :follow_up_due_on, :date
    add_column :work_orders, :follow_up_owner, :string
    add_column :work_orders, :vendor_reference, :string
    add_column :work_orders, :estimate_number, :string
    add_column :work_orders, :latest_follow_up_note, :text

    add_index :work_orders, :follow_up_due_on
    add_index :work_orders, :parts_eta
    add_index :work_orders, :estimate_number
  end
end
