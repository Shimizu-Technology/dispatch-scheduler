class ScopePmTaskTemplateUniquenessToActive < ActiveRecord::Migration[8.1]
  def change
    remove_index :pm_tasks, name: "index_pm_tasks_on_template_item_location_period", if_exists: true
    add_index :pm_tasks,
      [ :pm_template_item_id, :location_id, :period_start ],
      unique: true,
      where: "pm_template_item_id IS NOT NULL AND period_start IS NOT NULL AND archived_at IS NULL",
      name: "index_pm_tasks_on_template_item_location_period"
  end
end
