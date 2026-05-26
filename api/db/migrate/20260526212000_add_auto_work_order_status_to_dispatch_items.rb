class AddAutoWorkOrderStatusToDispatchItems < ActiveRecord::Migration[8.1]
  def change
    add_column :dispatch_items, :auto_work_order_status, :string
  end
end
