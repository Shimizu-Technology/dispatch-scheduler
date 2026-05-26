class AddPreviousWorkOrderStatusToDispatchItems < ActiveRecord::Migration[8.1]
  def change
    add_column :dispatch_items, :previous_work_order_status, :string
  end
end
