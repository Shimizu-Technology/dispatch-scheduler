require "test_helper"

class WorkOrderRetryReceiptTest < ActionDispatch::IntegrationTest
  test "retry after a lost response returns the same unnumbered work order without another audit" do
    values = request_values
    with_auth_env do
      post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
      assert_response :created
      original = JSON.parse(response.body)
      post "/api/v1/work_orders", params: values.to_a.reverse.to_h, headers: auth_headers, as: :json
      assert_response :success
      assert_equal original.fetch("id"), JSON.parse(response.body).fetch("id")
    end
    assert_equal 1, WorkOrder.count
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
    receipt = WorkOrderCreateReceipt.sole
    assert receipt.completed_at
    assert_equal WorkOrder.sole.id, receipt.work_order_id
    assert_match(/\A[0-9a-f]{64}\z/, receipt.payload_digest)
    refute_includes receipt.attributes.values.join, values.fetch(:description)
  end

  test "same receipt UUID with different permitted details is rejected" do
    values = request_values
    with_auth_env do
      post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
      assert_response :created
      post "/api/v1/work_orders", params: values.merge(description: "Different intended request"), headers: auth_headers, as: :json
    end
    assert_response :conflict
    assert_equal 1, WorkOrder.count
    assert_equal values.fetch(:description), WorkOrder.sole.description
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
  end

  test "receipt UUID is scoped to the authenticated user" do
    values = request_values
    ids = []
    with_auth_env do
      [ "first", "second" ].each do |identity|
        post "/api/v1/work_orders", params: values, headers: auth_headers(identity), as: :json
        assert_response :created
        ids << JSON.parse(response.body).fetch("id")
      end
    end
    assert_equal 2, ids.uniq.length
    assert_equal 2, WorkOrderCreateReceipt.count
    assert_equal 2, WorkOrder.count
  end

  test "permission and deactivation checks run before any replay" do
    values = request_values
    with_auth_env do
      headers = auth_headers
      post "/api/v1/work_orders", params: values, headers: headers, as: :json
      assert_response :created
      actor = User.find_by!(clerk_id: "qa-retry-default")
      actor.update!(role: "viewer")
      post "/api/v1/work_orders", params: values, headers: headers, as: :json
      assert_response :forbidden
      actor.update!(role: "dispatcher", active: false)
      post "/api/v1/work_orders", params: values, headers: headers, as: :json
      assert_response :forbidden
    end
    assert_equal 1, WorkOrder.count
    assert_equal 1, WorkOrderCreateReceipt.count
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
  end

  test "validation failure leaves no completed receipt and a corrected request uses a new UUID" do
    values = request_values.merge(required_technician_count: 0)
    with_auth_env do
      2.times do
        post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
        assert_response :unprocessable_entity
      end
      assert_equal 0, WorkOrder.count
      assert_equal 0, AuditEvent.where(action: "work_order.created").count
      refute WorkOrderCreateReceipt.sole.completed_at
      assert_nil WorkOrderCreateReceipt.sole.work_order_id

      post "/api/v1/work_orders", params: values.merge(required_technician_count: 1), headers: auth_headers, as: :json
      assert_response :conflict
      post "/api/v1/work_orders", params: values.merge(required_technician_count: 1, client_request_id: SecureRandom.uuid), headers: auth_headers, as: :json
      assert_response :created
    end
    assert_equal 1, WorkOrder.count
    assert_equal 1, WorkOrderCreateReceipt.where.not(completed_at: nil).count
  end

  test "audit failure rolls back business data and the same unchanged operation can retry" do
    values = request_values
    original = AuditEvent.method(:record!)
    invalid = AuditEvent.new
    begin
      AuditEvent.define_singleton_method(:record!) { |**| raise ActiveRecord::RecordInvalid.new(invalid) }
      with_auth_env do
        post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
      end
      assert_response :unprocessable_entity
      assert_equal 0, WorkOrder.count
      assert_nil WorkOrderCreateReceipt.sole.work_order_id
      assert_nil WorkOrderCreateReceipt.sole.completed_at
    ensure
      AuditEvent.define_singleton_method(:record!, original)
    end
    with_auth_env do
      post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
    end
    assert_response :created
    assert_equal 1, WorkOrder.count
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
    assert WorkOrderCreateReceipt.sole.completed_at
  end

  test "invalid UUID metadata is rejected and update metadata is ignored" do
    values = request_values
    with_auth_env do
      post "/api/v1/work_orders", params: values.merge(client_request_id: "not-a-uuid"), headers: auth_headers, as: :json
      assert_response :unprocessable_entity
      assert_equal 0, WorkOrderCreateReceipt.count
      post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
      assert_response :created
      id = JSON.parse(response.body).fetch("id")
      patch "/api/v1/work_orders/#{id}", params: { description: "Explicit edit", client_request_id: "ignored-on-update" }, headers: auth_headers, as: :json
      assert_response :success
      assert_equal "Explicit edit", WorkOrder.find(id).description
    end
    assert_equal 1, WorkOrderCreateReceipt.count
  end

  test "deleted completed result is not silently recreated on replay" do
    values = request_values
    with_auth_env do
      post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
      assert_response :created
      WorkOrder.sole.destroy!
      post "/api/v1/work_orders", params: values, headers: auth_headers, as: :json
    end
    assert_response :conflict
    assert_equal 0, WorkOrder.count
    assert WorkOrderCreateReceipt.sole.completed_at
    assert_nil WorkOrderCreateReceipt.sole.work_order_id
  end

  private

  def request_values
    { client: "QA Facilities", location: "QA Retry Site", description: "Unnumbered synthetic request", source: "phone", external_id: "", priority: "P3", status: "new", client_request_id: SecureRandom.uuid }
  end

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers(identity = "default")
    User.find_or_create_by!(clerk_id: "qa-retry-#{identity}") do |user|
      user.email = "qa-retry-#{identity}@example.test"
      user.role = "dispatcher"
    end
    { "Authorization" => "Bearer test_token:qa-retry-#{identity}:qa-retry-#{identity}@example.test" }
  end
end
