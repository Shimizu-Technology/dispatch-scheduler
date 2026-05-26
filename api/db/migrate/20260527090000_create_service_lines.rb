class CreateServiceLines < ActiveRecord::Migration[8.1]
  def change
    create_table :service_lines do |t|
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.text :notes

      t.timestamps
    end

    add_index :service_lines, :name, unique: true
    add_index :service_lines, [ :active, :position ]

    reversible do |dir|
      dir.up do
        now = "CURRENT_TIMESTAMP"
        execute <<~SQL.squish
          INSERT INTO service_lines (name, position, active, created_at, updated_at)
          VALUES
            ('Mobil / CBRE', 10, TRUE, #{now}, #{now}),
            ('Hotels / Kitchens / Restaurants', 20, TRUE, #{now}, #{now}),
            ('Public Schools / Sodexo', 30, TRUE, #{now}, #{now}),
            ('General', 40, TRUE, #{now}, #{now})
        SQL
      end
    end
  end
end
