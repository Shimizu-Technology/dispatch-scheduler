require "test_helper"

class WorkOrderLegacyClientTest < ActionDispatch::IntegrationTest
  test "main frontend list create update and archive calls work without new concurrency fields" do
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    User.create!(clerk_id: "legacy_intake", email: "legacy-intake@example.test", role: "dispatcher")
    headers = { "Authorization" => "Bearer test_token:legacy_intake:legacy-intake@example.test" }

    get "/api/v1/work_orders", params: { archived: "active", page: 1, per_page: 50, sort: "scheduled_date", direction: "asc" }, headers: headers
    assert_response :success
    assert_equal [], JSON.parse(response.body).fetch("work_orders")

    values = { client: "Synthetic legacy client", location: "Synthetic legacy site", region: "North", description: "Synthetic legacy repair", source: "whatsapp", external_id: "SYNTHETIC-LEGACY", priority: "P3", status: "needs_assessment", trade_category: "General" }
    post "/api/v1/work_orders", params: values, headers: headers, as: :json
    assert_response :created
    created = JSON.parse(response.body)
    id = created.fetch("id")
    assert_equal 0, created.fetch("lock_version")
    assert_equal 0, WorkOrderCreateReceipt.count

    patch "/api/v1/work_orders/#{id}", params: values.merge(description: "Synthetic legacy edit"), headers: headers, as: :json
    assert_response :success
    assert_equal "Synthetic legacy edit", WorkOrder.find(id).description
    assert_equal 1, WorkOrder.find(id).lock_version

    patch "/api/v1/work_orders/#{id}/archive", params: {}, headers: headers, as: :json
    assert_response :success
    assert WorkOrder.find(id).archived?
    get "/api/v1/work_orders", params: { archived: "active", page: 1, per_page: 50, sort: "scheduled_date", direction: "asc" }, headers: headers
    assert_response :success
    assert_equal [], JSON.parse(response.body).fetch("work_orders")
    patch "/api/v1/work_orders/#{id}/unarchive", params: {}, headers: headers, as: :json
    assert_response :success
    get "/api/v1/work_orders", params: { archived: "active", page: 1, per_page: 50, sort: "scheduled_date", direction: "asc" }, headers: headers
    assert_response :success
    assert_equal [ id ], JSON.parse(response.body).fetch("work_orders").map { |row| row.fetch("id") }
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end
end
