namespace :jmi do
  desc "Clear demo operational data while preserving users and app configuration"
  task clear_demo_data: :environment do
    puts "Clearing demo operational data..."
    ApplicationRecord.transaction do
      [
        FollowUp,
        DispatchItem,
        DispatchSchedule,
        WorkOrder,
        PmTask,
        TeamMembership,
        TeamDailyOverride,
        TechnicianAvailability,
        TechnicianSkill,
        TeamServiceLinePreference,
        Technician,
        Team,
        Location,
        Client
      ].each do |model|
        count = model.count
        model.delete_all
        puts "Deleted #{count} #{model.name} records"
      end
    end
    puts "Done. Users, audit events, and service lines were preserved."
  end
end
