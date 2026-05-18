require "test_helper"

class TechniciansControllerTest < ActionDispatch::IntegrationTest
  test "updates technician availability" do
    technician = Technician.create!(name: "Availability Tech", primary_trade: "General", is_driver: true, active: true)

    with_auth_env do
      patch "/api/v1/technicians/#{technician.id}", params: { date: DEFAULT_DATE.to_s, availability: "unavailable", reason: "Call-out" }, headers: auth_headers
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "unavailable", payload.fetch("availability")
    assert_equal "Call-out", technician.technician_availabilities.find_by!(date: DEFAULT_DATE).reason
    assert_equal "technician_availability.updated", AuditEvent.last.action
  end

  test "rolls back availability update when audit event cannot be recorded" do
    technician = Technician.create!(name: "Rollback Tech", primary_trade: "General", is_driver: true, active: true)

    invalid_event = AuditEvent.new
    original_record = AuditEvent.method(:record!)
    begin
      AuditEvent.define_singleton_method(:record!) { |**| raise ActiveRecord::RecordInvalid.new(invalid_event) }
      with_auth_env do
        patch "/api/v1/technicians/#{technician.id}", params: { date: DEFAULT_DATE.to_s, availability: "unavailable", reason: "Call-out" }, headers: auth_headers
      end
    ensure
      AuditEvent.define_singleton_method(:record!, original_record)
    end

    assert_response :unprocessable_entity
    assert_nil technician.technician_availabilities.find_by(date: DEFAULT_DATE)
  end

  private

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers
    User.find_or_create_by!(clerk_id: "technicians_123") do |user|
      user.email = "technicians@example.com"
      user.role = "dispatcher"
    end
    { "Authorization" => "Bearer test_token:technicians_123:technicians@example.com" }
  end
end
