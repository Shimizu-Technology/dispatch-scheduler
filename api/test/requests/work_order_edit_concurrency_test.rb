require "test_helper"

class WorkOrderEditConcurrencyTest < ActionDispatch::IntegrationTest
  self.use_transactional_tests = false

  teardown do
    WorkOrderIdentityLock.delete_all
    reset_dispatch_records
  end

  test "concurrent editors sharing a revision cannot both save" do
    wo = work_order
    User.create!(clerk_id: "concurrent_edit", email: "concurrent-edit@example.com", role: "dispatcher")
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    gate = Queue.new
    results = Queue.new
    threads = 2.times.map do |index|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          gate.pop
          begin
            session = ActionDispatch::Integration::Session.new(Rails.application)
            session.patch "/api/v1/work_orders/#{wo.id}", params: { expected_lock_version: 0, description: "Editor #{index}", notes: "Note #{index}" }, headers: { "Authorization" => "Bearer test_token:concurrent_edit:concurrent-edit@example.com" }
            results << [ session.response.status, JSON.parse(session.response.body) ]
          rescue => error
            results << error
          end
        end
      end
    end
    2.times { gate << true }
    threads.each { |thread| assert thread.join(10), "Concurrent request did not finish" }
    responses = 2.times.map { results.pop }
    assert responses.all? { |value| value.is_a?(Array) }, responses.inspect
    assert_equal [ 200, 409 ], responses.map(&:first).sort
    winner = responses.find { |status, _| status == 200 }.last
    loser = responses.find { |status, _| status == 409 }.last
    assert_equal winner.fetch("description"), wo.reload.description
    assert_equal winner.fetch("notes"), wo.notes
    assert_equal 1, wo.lock_version
    assert_equal winner.fetch("description"), loser.fetch("latest_work_order").fetch("description")
    assert_equal 1, AuditEvent.where(action: "work_order.updated").count
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end
end
