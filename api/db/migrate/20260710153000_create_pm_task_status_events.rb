class CreatePmTaskStatusEvents < ActiveRecord::Migration[8.1]
  def up
    create_table :pm_task_status_events do |t|
      t.references :pm_task, null: false, foreign_key: true
      t.references :user, null: true, foreign_key: true
      t.string :from_status
      t.string :to_status, null: false
      t.string :source, null: false, default: "application"
      t.datetime :occurred_at, null: false

      t.timestamps
    end
    add_index :pm_task_status_events, [ :pm_task_id, :occurred_at ]

    execute <<~SQL.squish
      INSERT INTO pm_task_status_events
        (pm_task_id, user_id, from_status, to_status, source, occurred_at, created_at, updated_at)
      SELECT id, NULL, NULL, status, 'migration_backfill',
        CASE WHEN status = 'completed' THEN COALESCE(completed_at, updated_at, created_at) ELSE COALESCE(updated_at, created_at) END,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM pm_tasks
    SQL
  end

  def down
    drop_table :pm_task_status_events
  end
end
