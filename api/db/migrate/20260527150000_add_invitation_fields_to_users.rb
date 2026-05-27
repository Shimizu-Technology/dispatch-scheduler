class AddInvitationFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :active, :boolean, null: false, default: true
    add_column :users, :invitation_status, :string, null: false, default: "accepted"
    add_column :users, :invited_at, :datetime
    add_column :users, :invitation_accepted_at, :datetime
    add_column :users, :clerk_invitation_id, :string
    add_reference :users, :invited_by, foreign_key: { to_table: :users }, null: true

    add_index :users, :active
    add_index :users, :invitation_status
    add_index :users, :clerk_invitation_id
  end
end
