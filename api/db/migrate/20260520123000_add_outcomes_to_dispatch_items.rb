class AddOutcomesToDispatchItems < ActiveRecord::Migration[8.1]
  def change
    add_column :dispatch_items, :outcome_status, :string, null: false, default: "pending"
    add_column :dispatch_items, :outcome_notes, :text
    add_column :dispatch_items, :completed_at, :datetime
    add_column :dispatch_items, :carried_over_to_date, :date
    add_column :dispatch_items, :reassignment_reason, :text
    add_index :dispatch_items, :outcome_status
    add_index :dispatch_items, :carried_over_to_date
  end
end
