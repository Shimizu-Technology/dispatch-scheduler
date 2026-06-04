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

ActiveRecord::Schema[8.1].define(version: 2026_05_28_100000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "audit_events", force: :cascade do |t|
    t.string "action", null: false
    t.datetime "created_at", null: false
    t.text "metadata"
    t.datetime "occurred_at", null: false
    t.integer "record_id"
    t.string "record_type", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id"
    t.index ["action"], name: "index_audit_events_on_action"
    t.index ["occurred_at"], name: "index_audit_events_on_occurred_at"
    t.index ["record_type", "record_id"], name: "index_audit_events_on_record_type_and_record_id"
    t.index ["user_id"], name: "index_audit_events_on_user_id"
  end

  create_table "clients", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.datetime "updated_at", null: false
  end

  create_table "dispatch_item_technicians", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "dispatch_item_id", null: false
    t.boolean "is_driver", default: false, null: false
    t.integer "position", default: 0, null: false
    t.string "primary_trade"
    t.bigint "technician_id", null: false
    t.string "technician_name", null: false
    t.datetime "updated_at", null: false
    t.index ["dispatch_item_id", "technician_id"], name: "index_dispatch_item_technicians_unique_assignment", unique: true
    t.index ["dispatch_item_id"], name: "index_dispatch_item_technicians_on_dispatch_item_id"
    t.index ["technician_id", "position"], name: "index_dispatch_item_technicians_on_technician_id_and_position"
    t.index ["technician_id"], name: "index_dispatch_item_technicians_on_technician_id"
  end

  create_table "dispatch_items", force: :cascade do |t|
    t.string "auto_work_order_status"
    t.date "carried_over_to_date"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.integer "dispatch_schedule_id", null: false
    t.text "notes"
    t.integer "order_index"
    t.text "outcome_notes"
    t.string "outcome_status", default: "pending", null: false
    t.integer "pm_task_id"
    t.date "previous_work_order_scheduled_date"
    t.string "previous_work_order_status"
    t.text "reassignment_reason"
    t.time "scheduled_time"
    t.integer "team_id", null: false
    t.datetime "updated_at", null: false
    t.integer "work_order_id"
    t.index ["carried_over_to_date"], name: "index_dispatch_items_on_carried_over_to_date"
    t.index ["dispatch_schedule_id"], name: "index_dispatch_items_on_dispatch_schedule_id"
    t.index ["outcome_status"], name: "index_dispatch_items_on_outcome_status"
    t.index ["pm_task_id"], name: "index_dispatch_items_on_pm_task_id"
    t.index ["team_id"], name: "index_dispatch_items_on_team_id"
    t.index ["work_order_id"], name: "index_dispatch_items_on_work_order_id"
  end

  create_table "dispatch_schedules", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date"
    t.datetime "finalized_at"
    t.integer "finalized_by_user_id"
    t.datetime "sent_at"
    t.integer "sent_by_user_id"
    t.string "status"
    t.datetime "updated_at", null: false
    t.index ["date", "status"], name: "index_dispatch_schedules_on_date_and_status"
    t.index ["finalized_by_user_id"], name: "index_dispatch_schedules_on_finalized_by_user_id"
    t.index ["sent_by_user_id"], name: "index_dispatch_schedules_on_sent_by_user_id"
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
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.date "deferred_until"
    t.string "frequency"
    t.integer "location_id", null: false
    t.text "notes"
    t.date "scheduled_date"
    t.string "source_file"
    t.string "status", default: "pending", null: false
    t.string "task_name"
    t.string "trade_category"
    t.datetime "updated_at", null: false
    t.index ["client_id"], name: "index_pm_tasks_on_client_id"
    t.index ["deferred_until"], name: "index_pm_tasks_on_deferred_until"
    t.index ["location_id"], name: "index_pm_tasks_on_location_id"
    t.index ["scheduled_date", "status"], name: "index_pm_tasks_on_scheduled_date_and_status"
    t.index ["status"], name: "index_pm_tasks_on_status"
  end

  create_table "service_lines", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.text "notes"
    t.integer "position", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["active", "position"], name: "index_service_lines_on_active_and_position"
    t.index ["name"], name: "index_service_lines_on_name", unique: true
  end

  create_table "team_daily_overrides", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date", null: false
    t.integer "team_id", null: false
    t.datetime "updated_at", null: false
    t.index ["team_id", "date"], name: "index_team_daily_overrides_on_team_id_and_date", unique: true
    t.index ["team_id"], name: "index_team_daily_overrides_on_team_id"
  end

  create_table "team_memberships", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date"
    t.integer "team_id", null: false
    t.integer "technician_id", null: false
    t.datetime "updated_at", null: false
    t.index ["team_id", "technician_id", "date"], name: "index_team_memberships_unique_daily", unique: true, where: "(date IS NOT NULL)"
    t.index ["team_id", "technician_id"], name: "index_team_memberships_unique_default", unique: true, where: "(date IS NULL)"
    t.index ["team_id"], name: "index_team_memberships_on_team_id"
    t.index ["technician_id"], name: "index_team_memberships_on_technician_id"
  end

  create_table "team_service_line_preferences", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "service_line_id", null: false
    t.bigint "team_id", null: false
    t.datetime "updated_at", null: false
    t.index ["service_line_id"], name: "index_team_service_line_preferences_on_service_line_id"
    t.index ["team_id", "service_line_id"], name: "index_team_service_line_preferences_unique", unique: true
    t.index ["team_id"], name: "index_team_service_line_preferences_on_team_id"
  end

  create_table "teams", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.string "crew_type", default: "general", null: false
    t.string "name"
    t.text "notes"
    t.string "region_preference"
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_teams_on_active"
    t.index ["archived_at"], name: "index_teams_on_archived_at"
  end

  create_table "technician_availabilities", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date"
    t.string "reason"
    t.string "status"
    t.integer "technician_id", null: false
    t.datetime "updated_at", null: false
    t.index ["technician_id", "date"], name: "index_technician_availabilities_unique_tech_date", unique: true
    t.index ["technician_id"], name: "index_technician_availabilities_on_technician_id"
  end

  create_table "technician_skills", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "skill"
    t.integer "technician_id", null: false
    t.datetime "updated_at", null: false
    t.index ["technician_id", "skill"], name: "index_technician_skills_on_technician_id_and_skill", unique: true
    t.index ["technician_id"], name: "index_technician_skills_on_technician_id"
  end

  create_table "technicians", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.boolean "is_driver", default: false, null: false
    t.string "name"
    t.text "notes"
    t.string "primary_trade"
    t.datetime "updated_at", null: false
  end

  create_table "users", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.string "clerk_id", null: false
    t.string "clerk_invitation_id"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.datetime "invitation_accepted_at"
    t.string "invitation_status", default: "accepted", null: false
    t.datetime "invited_at"
    t.bigint "invited_by_id"
    t.datetime "last_seen_at"
    t.string "name"
    t.string "role", default: "viewer", null: false
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_users_on_active"
    t.index ["clerk_id"], name: "index_users_on_clerk_id", unique: true
    t.index ["clerk_invitation_id"], name: "index_users_on_clerk_invitation_id"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["invitation_status"], name: "index_users_on_invitation_status"
    t.index ["invited_by_id"], name: "index_users_on_invited_by_id"
    t.index ["role"], name: "index_users_on_role"
  end

  create_table "work_orders", force: :cascade do |t|
    t.datetime "archived_at"
    t.datetime "assessed_at"
    t.datetime "assessment_due_at"
    t.integer "client_id", null: false
    t.boolean "corrective_maintenance", default: false, null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.boolean "estimate_required", default: false, null: false
    t.decimal "estimated_hours"
    t.string "external_id"
    t.integer "location_id", null: false
    t.string "normalized_priority"
    t.text "notes"
    t.string "original_status_text"
    t.boolean "pa_project", default: false, null: false
    t.text "pa_project_notes"
    t.string "priority"
    t.datetime "repair_due_at"
    t.datetime "reported_at"
    t.datetime "requested_at"
    t.integer "required_technician_count", default: 1, null: false
    t.datetime "response_due_at"
    t.date "scheduled_date"
    t.integer "service_line_id"
    t.string "source"
    t.string "source_reference"
    t.string "status"
    t.integer "team_id"
    t.string "title"
    t.string "trade_category"
    t.datetime "updated_at", null: false
    t.index ["archived_at"], name: "index_work_orders_on_archived_at"
    t.index ["assessment_due_at"], name: "index_work_orders_on_assessment_due_at"
    t.index ["client_id"], name: "index_work_orders_on_client_id"
    t.index ["corrective_maintenance"], name: "index_work_orders_on_corrective_maintenance"
    t.index ["estimate_required"], name: "index_work_orders_on_estimate_required"
    t.index ["location_id"], name: "index_work_orders_on_location_id"
    t.index ["pa_project"], name: "index_work_orders_on_pa_project"
    t.index ["repair_due_at"], name: "index_work_orders_on_repair_due_at"
    t.index ["reported_at"], name: "index_work_orders_on_reported_at"
    t.index ["service_line_id"], name: "index_work_orders_on_service_line_id"
    t.index ["team_id"], name: "index_work_orders_on_team_id"
  end

  add_foreign_key "audit_events", "users"
  add_foreign_key "dispatch_item_technicians", "dispatch_items"
  add_foreign_key "dispatch_item_technicians", "technicians"
  add_foreign_key "dispatch_items", "dispatch_schedules"
  add_foreign_key "dispatch_items", "pm_tasks"
  add_foreign_key "dispatch_items", "teams"
  add_foreign_key "dispatch_items", "work_orders"
  add_foreign_key "dispatch_schedules", "users", column: "finalized_by_user_id"
  add_foreign_key "dispatch_schedules", "users", column: "sent_by_user_id"
  add_foreign_key "follow_ups", "work_orders"
  add_foreign_key "locations", "clients"
  add_foreign_key "pm_tasks", "clients"
  add_foreign_key "pm_tasks", "locations"
  add_foreign_key "team_daily_overrides", "teams"
  add_foreign_key "team_memberships", "teams"
  add_foreign_key "team_memberships", "technicians"
  add_foreign_key "team_service_line_preferences", "service_lines"
  add_foreign_key "team_service_line_preferences", "teams"
  add_foreign_key "technician_availabilities", "technicians"
  add_foreign_key "technician_skills", "technicians"
  add_foreign_key "users", "users", column: "invited_by_id"
  add_foreign_key "work_orders", "clients"
  add_foreign_key "work_orders", "locations"
  add_foreign_key "work_orders", "service_lines"
  add_foreign_key "work_orders", "teams"
end
