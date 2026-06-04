class AddDispatchCapacityMetrics < ActiveRecord::Migration[8.1]
  def change
    add_column :dispatch_items, :capacity_overflow, :boolean, null: false, default: false
    add_column :dispatch_schedules, :capacity_deferred_items_count, :integer, null: false, default: 0
  end
end
