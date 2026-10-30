class CreateWorkOrderIdentityLocks < ActiveRecord::Migration[8.1]
  def change
    # Legacy work-order duplicates are preserved. Only lock identities are unique.
    create_table :work_order_identity_locks do |t|
      t.string :identity_digest, null: false, limit: 64
      t.timestamps
    end
    add_index :work_order_identity_locks, :identity_digest, unique: true
  end
end
