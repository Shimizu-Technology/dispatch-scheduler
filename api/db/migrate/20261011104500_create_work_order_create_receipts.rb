class CreateWorkOrderCreateReceipts < ActiveRecord::Migration[8.1]
  def change
    create_table :work_order_create_receipts do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :client_request_id, null: false, limit: 36
      t.string :payload_digest, null: false, limit: 64
      t.references :work_order, foreign_key: { on_delete: :nullify }
      t.datetime :completed_at
      t.timestamps
    end
    add_index :work_order_create_receipts, [ :user_id, :client_request_id ], unique: true, name: "index_work_order_create_receipts_on_user_and_request"
  end
end
