require "test_helper"

class TechniciansControllerTest < ActionDispatch::IntegrationTest
  test "dispatcher can create update and archive technician roster records" do
    with_auth_env do
      post "/api/v1/technicians", params: { name: "Roster Tech", primary_trade: "HVAC", skills: [ "HVAC", "Electrical" ], is_driver: true, notes: "Mobil regular" }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body)
    assert_equal "Roster Tech", payload.fetch("name")
    assert_equal true, payload.fetch("is_driver")
    assert_equal [ "Electrical", "HVAC" ], payload.fetch("skills")

    technician = Technician.find(payload.fetch("id"))
    with_auth_env do
      patch "/api/v1/technicians/#{technician.id}", params: { primary_trade: "General", skills: [ "General" ], is_driver: false }, headers: auth_headers
    end

    assert_response :success
    assert_equal "General", technician.reload.primary_trade
    assert_equal false, technician.is_driver
    assert_equal [ "General" ], technician.technician_skills.pluck(:skill)

    with_auth_env do
      delete "/api/v1/technicians/#{technician.id}", headers: auth_headers
    end

    assert_response :success
    assert_equal false, technician.reload.active?
  end

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
