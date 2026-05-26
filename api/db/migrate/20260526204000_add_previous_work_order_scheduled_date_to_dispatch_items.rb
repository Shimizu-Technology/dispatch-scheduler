class AddPreviousWorkOrderScheduledDateToDispatchItems < ActiveRecord::Migration[8.1]
  def change
    add_column :dispatch_items, :previous_work_order_scheduled_date, :date
  end
end
