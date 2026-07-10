class EnforceWorkOrderImportSourceSha256 < ActiveRecord::Migration[8.1]
  def change
    change_column_null :work_order_imports, :source_sha256, false
  end
end
