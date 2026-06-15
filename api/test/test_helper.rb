ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require_relative "support/dispatch_test_data"

class ActiveSupport::TestCase
  include ActiveSupport::Testing::TimeHelpers
  include DispatchTestData

  setup do
    reset_dispatch_records
  end
end
