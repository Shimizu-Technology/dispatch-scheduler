# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_11_062127) do
  create_table "clients", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.datetime "updated_at", null: false
  end

  create_table "dispatch_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "dispatch_schedule_id", null: false
    t.text "notes"
    t.integer "order_index"
    t.integer "pm_task_id"
    t.time "scheduled_time"
    t.integer "team_id", null: false
    t.datetime "updated_at", null: false
    t.integer "work_order_id"
    t.index ["dispatch_schedule_id"], name: "index_dispatch_items_on_dispatch_schedule_id"
    t.index ["pm_task_id"], name: "index_dispatch_items_on_pm_task_id"
    t.index ["team_id"], name: "index_dispatch_items_on_team_id"
    t.index ["work_order_id"], name: "index_dispatch_items_on_work_order_id"
  end

  create_table "dispatch_schedules", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date"
    t.string "status"
    t.datetime "updated_at", null: false
  end

  create_table "follow_ups", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "due_at"
    t.string "kind"
    t.text "notes"
    t.string "status"
    t.datetime "updated_at", null: false
    t.integer "work_order_id", null: false
    t.index ["work_order_id"], name: "index_follow_ups_on_work_order_id"
  end

  create_table "locations", force: :cascade do |t|
    t.string "address"
    t.integer "client_id", null: false
    t.datetime "created_at", null: false
    t.string "name"
    t.text "notes"
    t.string "region"
    t.datetime "updated_at", null: false
    t.index ["client_id"], name: "index_locations_on_client_id"
  end

  create_table "pm_tasks", force: :cascade do |t|
    t.integer "client_id", null: false
    t.datetime "created_at", null: false
    t.string "frequency"
    t.integer "location_id", null: false
    t.date "scheduled_date"
    t.string "source_file"
    t.string "task_name"
    t.string "trade_category"
    t.datetime "updated_at", null: false
    t.index ["client_id"], name: "index_pm_tasks_on_client_id"
    t.index ["location_id"], name: "index_pm_tasks_on_location_id"
  end

  create_table "team_memberships", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date"
    t.integer "team_id", null: false
    t.integer "technician_id", null: false
    t.datetime "updated_at", null: false
    t.index ["team_id"], name: "index_team_memberships_on_team_id"
    t.index ["technician_id"], name: "index_team_memberships_on_technician_id"
  end

  create_table "teams", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.text "notes"
    t.string "region_preference"
    t.datetime "updated_at", null: false
  end

  create_table "technician_availabilities", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date"
    t.string "reason"
    t.string "status"
    t.integer "technician_id", null: false
    t.datetime "updated_at", null: false
    t.index ["technician_id"], name: "index_technician_availabilities_on_technician_id"
  end

  create_table "technician_skills", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "skill"
    t.integer "technician_id", null: false
    t.datetime "updated_at", null: false
    t.index ["technician_id"], name: "index_technician_skills_on_technician_id"
  end

  create_table "technicians", force: :cascade do |t|
    t.boolean "active"
    t.datetime "created_at", null: false
    t.boolean "is_driver"
    t.string "name"
    t.string "primary_trade"
    t.datetime "updated_at", null: false
  end

  create_table "work_orders", force: :cascade do |t|
    t.integer "client_id", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.decimal "estimated_hours"
    t.string "external_id"
    t.integer "location_id", null: false
    t.string "normalized_priority"
    t.text "notes"
    t.string "original_status_text"
    t.string "priority"
    t.datetime "repair_due_at"
    t.datetime "requested_at"
    t.datetime "response_due_at"
    t.date "scheduled_date"
    t.string "source"
    t.string "source_reference"
    t.string "status"
    t.integer "team_id"
    t.string "title"
    t.string "trade_category"
    t.datetime "updated_at", null: false
    t.index ["client_id"], name: "index_work_orders_on_client_id"
    t.index ["location_id"], name: "index_work_orders_on_location_id"
    t.index ["team_id"], name: "index_work_orders_on_team_id"
  end

  add_foreign_key "dispatch_items", "dispatch_schedules"
  add_foreign_key "dispatch_items", "pm_tasks"
  add_foreign_key "dispatch_items", "teams"
  add_foreign_key "dispatch_items", "work_orders"
  add_foreign_key "follow_ups", "work_orders"
  add_foreign_key "locations", "clients"
  add_foreign_key "pm_tasks", "clients"
  add_foreign_key "pm_tasks", "locations"
  add_foreign_key "team_memberships", "teams"
  add_foreign_key "team_memberships", "technicians"
  add_foreign_key "technician_availabilities", "technicians"
  add_foreign_key "technician_skills", "technicians"
  add_foreign_key "work_orders", "clients"
  add_foreign_key "work_orders", "locations"
  add_foreign_key "work_orders", "teams"
end
