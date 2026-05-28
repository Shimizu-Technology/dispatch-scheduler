namespace :jmi do
  desc "Clear demo operational data while preserving users, audit history, service lines, crews, and technicians"
  task clear_demo_data: :environment do
    models = [
      FollowUp,
      DispatchItem,
      DispatchSchedule,
      WorkOrder,
      PmTask,
      Location,
      Client
    ]

    counts = models.to_h { |model| [ model.name, model.count ] }
    preserved = [
      "User",
      "AuditEvent",
      "ServiceLine",
      "Team",
      "TeamMembership",
      "TeamDailyOverride",
      "TeamServiceLinePreference",
      "Technician",
      "TechnicianSkill",
      "TechnicianAvailability"
    ]

    puts "Operational records to clear:"
    counts.each { |name, count| puts "  #{name}: #{count}" }
    puts "Preserved tables: #{preserved.join(', ')}"

    unless ENV["CONFIRM"] == "clear_demo_data"
      puts "Dry run only. Re-run with CONFIRM=clear_demo_data to delete these operational records."
      next
    end

    puts "Clearing demo operational data..."
    ApplicationRecord.transaction do
      models.each do |model|
        count = model.count
        model.delete_all
        puts "Deleted #{count} #{model.name} records"
      end
    end
    puts "Done. Users, audit events, service lines, crews, technicians, skills, and availability were preserved."
  end
end
