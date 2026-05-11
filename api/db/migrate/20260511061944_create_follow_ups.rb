class CreateFollowUps < ActiveRecord::Migration[8.1]
  def change
    create_table :follow_ups do |t|
      t.references :work_order, null: false, foreign_key: true
      t.string :kind
      t.string :status
      t.text :notes
      t.datetime :due_at

      t.timestamps
    end
  end
end
