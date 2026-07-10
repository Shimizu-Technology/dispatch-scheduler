class AddWorkOrderClosureAndStatusHistory < ActiveRecord::Migration[8.1]
  def up
    add_column :work_orders, :closed_at, :datetime
    add_index :work_orders, :closed_at

    create_table :work_order_status_events do |t|
      t.references :work_order, null: false, foreign_key: true
      t.references :user, null: true, foreign_key: true
      t.string :from_status
      t.string :to_status, null: false
      t.string :source, null: false, default: "application"
      t.datetime :occurred_at, null: false

      t.timestamps
    end
    add_index :work_order_status_events, [ :work_order_id, :occurred_at ]

    quoted_closed_statuses = %w[completed closed cancelled].map { |status| connection.quote(status) }.join(", ")
    execute <<~SQL.squish
      UPDATE work_orders
      SET closed_at = updated_at
      WHERE status IN (#{quoted_closed_statuses}) AND closed_at IS NULL
    SQL
    execute <<~SQL.squish
      INSERT INTO work_order_status_events
        (work_order_id, user_id, from_status, to_status, source, occurred_at, created_at, updated_at)
      SELECT id, NULL, NULL, status, 'migration_backfill', COALESCE(updated_at, created_at), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM work_orders
    SQL
  end

  def down
    drop_table :work_order_status_events
    remove_index :work_orders, :closed_at
    remove_column :work_orders, :closed_at
  end
end
