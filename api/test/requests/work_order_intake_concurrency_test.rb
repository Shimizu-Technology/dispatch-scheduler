require "test_helper"

class WorkOrderIntakeConcurrencyTest < ActionDispatch::IntegrationTest
  self.use_transactional_tests = false

  test "concurrent numbered requests create one work order and one audit event" do
    statuses = concurrent_requests([ [ :post, "/api/v1/work_orders", "whatsapp", "QA-CONCURRENT" ], [ :post, "/api/v1/work_orders", "whatsapp", "QA-CONCURRENT" ] ])
    assert_equal [ 201, 409 ], statuses.sort_by(&:to_s)
    assert_equal 1, WorkOrder.count
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
  end

  test "concurrent normalized variants share one identity lock" do
    statuses = concurrent_requests([ [ :post, "/api/v1/work_orders", "whatsapp", "QA-CONCURRENT" ], [ :post, "/api/v1/work_orders", " WhatsApp ", "qa-concurrent" ] ])
    assert_equal [ 201, 409 ], statuses.sort_by(&:to_s)
    assert_equal 1, WorkOrder.count
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
    assert_equal 1, WorkOrderIdentityLock.count
  end

  test "create and renumber cannot claim the same target identity concurrently" do
    existing = work_order(title: "Original identity")
    existing.update!(source: "whatsapp", external_id: "QA-ORIGINAL")
    statuses = concurrent_requests([ [ :post, "/api/v1/work_orders", "whatsapp", "QA-TARGET" ], [ :patch, "/api/v1/work_orders/#{existing.id}", "whatsapp", "QA-TARGET" ] ])
    assert_includes [ [ 200, 409 ], [ 201, 409 ] ], statuses.sort_by(&:to_s)
    assert_equal 1, WorkOrder.where(source: "whatsapp", external_id: "QA-TARGET").count
  end

  test "concurrent unchanged unnumbered operation replays one committed work order" do
    request = [ :post, "/api/v1/work_orders", "phone", "", { client_request_id: SecureRandom.uuid } ]
    statuses = concurrent_requests([ request, request ])
    assert_equal [ 200, 201 ], statuses.sort_by(&:to_s)
    assert_equal 1, WorkOrder.count
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
    assert_equal 1, WorkOrderCreateReceipt.count
    assert_equal WorkOrder.sole.id, WorkOrderCreateReceipt.sole.work_order_id
  end

  test "concurrent different payloads using one operation UUID do not both save" do
    id = SecureRandom.uuid
    statuses = concurrent_requests([ [ :post, "/api/v1/work_orders", "phone", "", { client_request_id: id } ], [ :post, "/api/v1/work_orders", "phone", "", { client_request_id: id, description: "Different operation" } ] ])
    assert_equal [ 201, 409 ], statuses.sort_by(&:to_s)
    assert_equal 1, WorkOrder.count
    assert_equal 1, AuditEvent.where(action: "work_order.created").count
    assert WorkOrderCreateReceipt.sole.completed_at
  end

  teardown do
    WorkOrderIdentityLock.delete_all
    reset_dispatch_records
  end

  private

  def concurrent_requests(requests)
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    User.create!(clerk_id: "qa_intake_concurrency", email: "qa-intake@example.test", name: "Test User", role: "dispatcher", invitation_status: "accepted", invitation_accepted_at: Time.current, last_seen_at: Time.current)
    site = location(name: "QA Concurrent Site", client_record: client("QA Facilities"))
    headers = { "Authorization" => "Bearer test_token:qa_intake_concurrency:qa-intake@example.test" }
    ready = Queue.new
    release = Queue.new
    results = Queue.new
    threads = requests.map do |method, path, source, number, extra|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          release.pop
          session = ActionDispatch::Integration::Session.new(Rails.application)
          values = { client: site.client.name, location: site.name, source: source, external_id: number, description: "Synthetic concurrent request" }.merge(extra || {})
          session.public_send(method, path, params: values, headers: headers, as: :json)
          results << session.response.status
        end
      rescue => error
        results << error.class.name
      end
    end
    2.times { ready.pop }
    2.times { release << true }
    threads.each { |thread| assert thread.join(10), "Concurrent request did not finish" }
    2.times.map { results.pop }
  ensure
    threads&.each { |thread| thread.kill if thread.alive? }
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end
end
