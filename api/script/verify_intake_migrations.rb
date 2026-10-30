# Run with rails runner against an explicitly named disposable database only.
# Never loads seeds or copies customer data. See docs/INTAKE_RELEASE_SLICE_A.md.
connection = ActiveRecord::Base.connection
config = ActiveRecord::Base.connection_db_config
expected = ENV.fetch("JMI_INTAKE_VERIFICATION_DATABASE")
actual = config.database
if connection.adapter_name == "PostgreSQL"
  identity = connection.select_one("SELECT current_database() AS database, host(inet_server_addr()) AS host, inet_server_port() AS port")
  raise "Verification requires local PostgreSQL" unless %w[127.0.0.1 ::1].include?(identity.fetch("host"))
  raise "Unexpected database" unless identity.fetch("database") == expected && expected.start_with?("jmi_intake_release_slice_a_")
else
  raise "Verification requires SQLite" unless connection.adapter_name == "SQLite"
  path = File.expand_path(actual, Rails.root)
  raise "Unexpected database" unless path == File.expand_path(expected, Rails.root) && path.start_with?(Rails.root.join("storage/intake_release_").to_s)
end
puts "Verified disposable database: #{connection.adapter_name} #{actual}"

context = ActiveRecord::Base.connection_pool.migration_context
base = 20260621130000
head = 20261011105000
versions = [ 20261011104000, 20261011104500, 20261011105000 ]
raise "Unrelated migrations present" unless context.migrations.select { |migration| migration.version > base }.map(&:version) == versions
context.migrate(base)
WorkOrder.reset_column_information
client = Client.create!(name: "Synthetic migration rehearsal")
site = Location.create!(client: client, name: "Synthetic site", region: "Unknown")
order = WorkOrder.create!(client: client, location: site, source: "manual", description: "Synthetic existing row", title: "Migration rehearsal", priority: "P3", normalized_priority: "P3", status: "new", trade_category: "General", required_technician_count: 1)
id = order.id

2.times do |round|
  context.migrate(head)
  WorkOrder.reset_column_information
  raise "Existing row revision is not zero" unless WorkOrder.find(id).lock_version == 0
  raise "Revision must be non-null with default zero" unless WorkOrder.columns_hash.fetch("lock_version").then { |column| !column.null && column.default.to_s == "0" }
  raise "Missing intake tables" unless %w[work_order_identity_locks work_order_create_receipts].all? { |table| connection.table_exists?(table) }
  context.migrate(base)
  WorkOrder.reset_column_information
  raise "Rollback left intake tables" if %w[work_order_identity_locks work_order_create_receipts].any? { |table| connection.table_exists?(table) }
  raise "Rollback left lock_version" if WorkOrder.column_names.include?("lock_version")
  raise "Existing work order lost" unless WorkOrder.exists?(id)
  puts "Round #{round + 1}: all three migrations up/down passed; existing row retained and defaulted to revision 0"
end
context.migrate(head)
puts "Re-applied all three intake migrations successfully"
