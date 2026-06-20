require "test_helper"

class PmTemplatesControllerTest < ActionDispatch::IntegrationTest
  test "dispatcher creates previews and generates a PM template" do
    mobil = service_line("Mobil / CBRE")

    with_auth_env do
      post "/api/v1/pm_templates", params: {
        name: "Mobil Monthly PMs",
        client: "Mobil",
        service_line_id: mobil.id,
        locations: [
          { name: "Yigo North", region: "North" },
          { name: "Airport", region: "Central" }
        ],
        items: [
          { task_name: "Electrical Inspection", trade_category: "Electrical", frequency: "monthly", estimated_minutes: 45 },
          { task_name: "Generator Inspection", trade_category: "General", frequency: "monthly", estimated_minutes: 30 }
        ]
      }, headers: auth_headers
    end

    assert_response :created
    template = JSON.parse(response.body).fetch("pm_template")
    assert_equal "Mobil Monthly PMs", template.fetch("name")
    assert_equal 2, template.fetch("locations").size
    assert_equal 2, template.fetch("items").size
    assert_equal "pm_template.created", AuditEvent.last.action

    with_auth_env do
      post "/api/v1/pm_templates/#{template.fetch("id")}/preview", params: { month: "2026-06", frequencies: [ "monthly" ] }, headers: auth_headers
    end

    assert_response :success
    preview = JSON.parse(response.body)
    assert_equal 4, preview.dig("summary", "candidate_count")
    assert_equal 4, preview.dig("summary", "new_count")

    with_auth_env do
      post "/api/v1/pm_templates/#{template.fetch("id")}/generate", params: { month: "2026-06", frequencies: [ "monthly" ] }, headers: auth_headers
    end

    assert_response :created
    generated = JSON.parse(response.body)
    assert_equal 4, generated.dig("summary", "created_count")
    assert_equal 4, generated.fetch("created").size
    assert_equal "2026-06-30", generated.fetch("created").first.fetch("due_on")
  end

  test "generation skips existing duplicates" do
    site = location(name: "Yigo North", region: "North")
    template = pm_template(locations: [ site ])
    PmTemplateGenerationService.new(template: template, month: "2026-06").generate!

    with_auth_env do
      post "/api/v1/pm_templates/#{template.id}/generate", params: { month: "2026-06" }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body)
    assert_equal 0, payload.dig("summary", "created_count")
    assert_equal 1, payload.dig("summary", "duplicate_count")
  end

  test "template creation preserves existing station region metadata" do
    existing_location = location(name: "Yigo North", region: "North")

    with_auth_env do
      post "/api/v1/pm_templates", params: {
        name: "Mobil Monthly PMs",
        client: "Mobil",
        locations: [
          { name: "Yigo North", region: "Typo Region" }
        ],
        items: [
          { task_name: "Electrical Inspection", trade_category: "Electrical", frequency: "monthly", estimated_minutes: 45 }
        ]
      }, headers: auth_headers
    end

    assert_response :created
    assert_equal "North", existing_location.reload.region
    payload = JSON.parse(response.body).fetch("pm_template")
    assert_equal "North", payload.fetch("locations").first.fetch("region")
  end

  test "template creation deduplicates repeated stations before inserting assignments" do
    with_auth_env do
      post "/api/v1/pm_templates", params: {
        name: "Mobil Monthly PMs",
        client: "Mobil",
        locations: [
          { name: "Yigo North", region: "North" },
          { name: " yigo north ", region: "Typo Region" },
          { name: "Airport", region: "Central" }
        ],
        items: [
          { task_name: "Electrical Inspection", trade_category: "Electrical", frequency: "monthly", estimated_minutes: 45 }
        ]
      }, headers: auth_headers
    end

    assert_response :created
    payload = JSON.parse(response.body).fetch("pm_template")
    assert_equal [ "Airport", "Yigo North" ], payload.fetch("locations").map { |station| station.fetch("name") }.sort
    assert_equal 2, PmTemplateLocation.count
  end

  test "preview and generate reject inactive templates" do
    template = pm_template(name: "Inactive Template")
    template.update!(active: false)

    with_auth_env do
      post "/api/v1/pm_templates/#{template.id}/preview", params: { month: "2026-06" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal [ "PM template is inactive" ], JSON.parse(response.body).fetch("errors")

    with_auth_env do
      post "/api/v1/pm_templates/#{template.id}/generate", params: { month: "2026-06" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal [ "PM template is inactive" ], JSON.parse(response.body).fetch("errors")
  end

  test "viewer cannot create or generate templates" do
    template = pm_template

    with_auth_env do
      post "/api/v1/pm_templates", params: { name: "Nope", locations: [], items: [] }, headers: auth_headers("viewer_pm_template_123", "viewer-pm-template@example.com", "viewer")
    end
    assert_response :forbidden

    with_auth_env do
      post "/api/v1/pm_templates/#{template.id}/generate", params: { month: "2026-06" }, headers: auth_headers("viewer_pm_template_123", "viewer-pm-template@example.com", "viewer")
    end
    assert_response :forbidden
  end

  test "lists active templates for viewers" do
    active = pm_template(name: "Active Template")
    pm_template(name: "Inactive Template").update!(active: false)

    with_auth_env do
      get "/api/v1/pm_templates", headers: auth_headers("viewer_pm_template_list_123", "viewer-pm-list@example.com", "viewer")
    end

    assert_response :success
    payload = JSON.parse(response.body).fetch("pm_templates")
    assert_equal [ active.id ], payload.map { |template| template.fetch("id") }
  end

  private

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers(clerk_id = "dispatcher_pm_template_123", email = "dispatcher-pm-template@example.com", role = "dispatcher")
    User.find_or_create_by!(clerk_id: clerk_id) do |user|
      user.email = email
      user.role = role
    end
    { "Authorization" => "Bearer test_token:#{clerk_id}:#{email}" }
  end
end
