require "test_helper"
require "net/http"
require "tempfile"

class WorkOrderOcrExtractorTest < ActiveSupport::TestCase
  test "normalizes extracted work order rows" do
    response = Struct.new(:code, :body).new("200", {
      choices: [
        {
          message: {
            content: {
              work_orders: [
                {
                  client: "Mobil",
                  location: "Yigo Station",
                  region: "North",
                  external_id: "WO-123",
                  title: "Leaking sink",
                  description: "Bathroom sink leaking under counter",
                  priority: "P2",
                  status: "approved",
                  trade_category: "Plumbing",
                  scheduled_date: "2026-05-05",
                  confidence: "high",
                  issues: []
                }
              ]
            }.to_json
          }
        }
      ]
    }.to_json)

    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_value| }
    fake_http.define_singleton_method(:open_timeout=) { |_value| }
    fake_http.define_singleton_method(:read_timeout=) { |_value| }
    fake_http.define_singleton_method(:request) { |_request| response }

    previous_key = ENV["OPENROUTER_API_KEY"]
    ENV["OPENROUTER_API_KEY"] = "test-key"
    original_new = Net::HTTP.method(:new)
    begin
      Net::HTTP.define_singleton_method(:new) { |_host, _port| fake_http }
      result = WorkOrderOcrExtractor.extract(image_upload)
      assert_equal true, result[:success], result.inspect
      row = result[:work_orders].first
      assert_equal "WO-123", row.fetch(:external_id)
      assert_equal "P2", row.fetch(:normalized_priority)
      assert_equal "approved", row.fetch(:status)
      assert_equal "2026-05-05", row.fetch(:scheduled_date)
    ensure
      Net::HTTP.define_singleton_method(:new, original_new)
    end
  ensure
    previous_key.nil? ? ENV.delete("OPENROUTER_API_KEY") : ENV["OPENROUTER_API_KEY"] = previous_key
  end

  test "rejects unsupported uploads before calling OpenRouter" do
    result = WorkOrderOcrExtractor.extract(binary_upload)

    assert_equal false, result[:success]
    assert_includes result[:error], "Unsupported file type"
  end

  test "text uploads route through text extraction" do
    result = nil
    with_openrouter_response({ work_orders: [ { title: "Pasted issue", description: "Door closer broken", priority: "P3", status: "needs_assessment", trade_category: "General", parts_status: "ordered", parts_eta: "2026-06-20", follow_up_due_on: "2026-06-15" } ] }.to_json) do
      result = WorkOrderOcrExtractor.extract(text_upload)
    end

    assert_equal true, result[:success], result.inspect
    row = result[:work_orders].first
    assert_equal "ordered", row.fetch(:parts_status)
    assert_equal "2026-06-20", row.fetch(:parts_eta)
    assert_equal "2026-06-15", row.fetch(:follow_up_due_on)
  end

  test "rejects spoofed image content type" do
    file = Tempfile.new([ "spoofed", ".jpg" ])
    file.write("not actually an image")
    file.rewind
    upload = Rack::Test::UploadedFile.new(file.path, "image/jpeg", false, original_filename: "spoofed.jpg")

    result = WorkOrderOcrExtractor.extract(upload)

    assert_equal false, result[:success]
    assert_includes result[:error], "Unsupported file type"
  end

  test "sends all 20000 text characters including the final request sentinel" do
    text = "é" * 19_990 + "FINAL-END!"
    assert_equal 20_000, text.length
    with_openrouter_response({ work_orders: [] }.to_json) do |requests|
      result = WorkOrderOcrExtractor.extract(text: text)
      assert result[:success], result.inspect
      assert_equal 1, requests.length
      content = JSON.parse(requests.first.body).dig("messages", 0, "content")
      assert content.end_with?(text), "The complete source must reach extraction without truncation"
    end
  end

  test "rejects oversized pasted and uploaded text before calling the provider" do
    text = "x" * 20_000 + "LAST-REQUEST"
    with_openrouter_response({ work_orders: [] }.to_json) do |requests|
      [ WorkOrderOcrExtractor.extract(text: text), WorkOrderOcrExtractor.extract(text_upload(text)) ].each do |result|
        assert_equal false, result[:success]
        assert_includes result[:error], "20,000 characters"
        assert_includes result[:error], "Split"
      end
      assert_empty requests
    end
  end

  test "accepts exactly 20000 uploaded text characters but rejects 20001" do
    with_openrouter_response({ work_orders: [] }.to_json) do |requests|
      assert WorkOrderOcrExtractor.extract(text_upload("x" * 20_000))[:success]
      result = WorkOrderOcrExtractor.extract(text_upload("x" * 20_001))
      assert_equal false, result[:success]
      assert_equal 1, requests.length
    end
  end

  test "reports omitted extracted requests instead of silently dropping them" do
    rows = 26.times.map { |index| valid_row.merge(external_id: "QA-#{index + 1}") }
    with_openrouter_response({ work_orders: rows }.to_json) do
      result = WorkOrderOcrExtractor.extract(text: "26 synthetic requests")
      assert result[:success], result.inspect
      assert_equal 25, result[:work_orders].length
      assert_equal "QA-25", result[:work_orders].last[:external_id]
      assert_includes result[:warnings].first, "26 requests"
      assert_includes result[:warnings].first, "1 additional request omitted"
      assert_includes result[:warnings].first, "preview the remaining requests separately"
    end
  end

  test "rejects malformed provider structures instead of inventing empty or default requests" do
    malformed = [ [], "synthetic", nil, 42, false, {}, { work_orders: nil },
      { work_orders: {} }, { work_orders: [ nil ] }, { work_orders: [ valid_row, "bad row" ] },
      { work_orders: Array.new(25) { valid_row } + [ false ] } ]
    malformed.each do |data|
      with_openrouter_response(data.to_json) do
        result = WorkOrderOcrExtractor.extract(text: "Synthetic request to review")
        assert_equal false, result[:success], data.inspect
        assert_includes result[:error], "invalid structure"
        assert_not result.key?(:work_orders), "Malformed data must not produce review drafts"
      end
    end
  end

  test "accepts an explicit empty work orders array from the provider" do
    with_openrouter_response({ work_orders: [] }.to_json) do
      result = WorkOrderOcrExtractor.extract(text: "No readable synthetic requests")
      assert_equal true, result[:success], result.inspect
      assert_equal [], result[:work_orders]
      assert_nil result[:warnings]
    end
  end

  test "does not add a cap warning at exactly 25 rows" do
    with_openrouter_response({ work_orders: Array.new(25) { valid_row } }.to_json) do
      result = WorkOrderOcrExtractor.extract(text: "25 synthetic requests")
      assert_equal 25, result[:work_orders].length
      assert_nil result[:warnings]
    end
  end

  test "invalid high confidence fields become low confidence with review issues" do
    row = valid_row.merge(priority: "urgent", status: "done", trade_category: "not-a-trade", location: " unknown ",
      scheduled_date: "2026-02-31", reported_at: "2026-02-31T08:00:00+10:00", parts_ordered_at: "not-a-time",
      parts_eta: "not-a-date", follow_up_due_on: "not-a-date", issues: [ "Verify access", "Verify access" ])
    with_openrouter_response({ work_orders: [ row ] }.to_json) do
      result = WorkOrderOcrExtractor.extract(text: "Synthetic request with ambiguous details")[:work_orders].first
      assert_equal "low", result[:confidence]
      assert_equal "P3", result[:priority]
      assert_equal "needs_assessment", result[:status]
      assert_equal "done", result[:original_status_text]
      assert_equal "General", result[:trade_category]
      %i[scheduled_date reported_at parts_ordered_at parts_eta follow_up_due_on].each { |field| assert_nil result[field] }
      %w[Priority Status Trade Location Scheduled Reported Parts Follow].each do |label|
        assert result[:issues].any? { |issue| issue.start_with?(label) }, "Missing issue for #{label}"
      end
      assert_equal 1, result[:issues].count("Verify access")
    end
  end

  test "missing required details expose defaults and unknown location for review" do
    with_openrouter_response({ work_orders: [ { confidence: "high" } ] }.to_json) do
      row = WorkOrderOcrExtractor.extract(text: "Incomplete synthetic request")[:work_orders].first
      assert_equal "P3", row[:priority]
      assert_equal "needs_assessment", row[:status]
      assert_equal "General", row[:trade_category]
      assert_equal "Unknown", row[:location]
      assert_equal "low", row[:confidence]
      assert_equal 5, row[:issues].length
      assert row[:issues].any? { |issue| issue.include?("Priority was missing") }
      assert row[:issues].any? { |issue| issue.include?("Location is unknown") }
      assert_nil row[:scheduled_date]
      assert_nil row[:reported_at]
    end
  end

  test "partial dates and time only values cannot invent a current calendar date" do
    with_openrouter_response({ work_orders: [ valid_row.merge(scheduled_date: "May 5", reported_at: "14:30") ] }.to_json) do
      row = WorkOrderOcrExtractor.extract(text: "Synthetic incomplete date")[:work_orders].first
      assert_nil row[:scheduled_date]
      assert_nil row[:reported_at]
      assert_equal "low", row[:confidence]
      assert_equal 2, row[:issues].length
    end
  end

  test "false and array date fields are invalid values rather than absent optional dates" do
    with_openrouter_response({ work_orders: [ valid_row.merge(scheduled_date: false, reported_at: [], parts_eta: nil, follow_up_due_on: " ") ] }.to_json) do
      row = WorkOrderOcrExtractor.extract(text: "Synthetic malformed dates")[:work_orders].first
      assert_equal "low", row[:confidence]
      assert_nil row[:scheduled_date]
      assert_nil row[:reported_at]
      assert_equal 2, row[:issues].length
    end
  end

  test "valid populated fields retain confidence and Guam date time semantics" do
    source = valid_row.merge(scheduled_date: "2026-10-12", reported_at: "2026-10-11T08:15:00Z",
      parts_ordered_at: "2026-10-11 09:00", parts_eta: "2026-10-13", follow_up_due_on: "2026-10-14")
    with_openrouter_response({ work_orders: [ source ] }.to_json) do
      row = WorkOrderOcrExtractor.extract(text: "Valid synthetic request")[:work_orders].first
      assert_equal "high", row[:confidence]
      assert_empty row[:issues]
      assert_equal "P2", row[:priority]
      assert_equal "approved", row[:status]
      assert_equal "Plumbing", row[:trade_category]
      assert_equal "2026-10-12", row[:scheduled_date]
      assert_equal "2026-10-11T18:15:00+10:00", row[:reported_at]
      assert_equal "2026-10-11T09:00:00+10:00", row[:parts_ordered_at]
      assert_equal "2026-10-13", row[:parts_eta]
      assert_equal "2026-10-14", row[:follow_up_due_on]
    end
  end

  private

  def valid_row
    { client: "QA Facilities", location: "QA North Site", region: "North", title: "Sink leak", description: "Synthetic sink leak",
      priority: "P2", status: "approved", trade_category: "Plumbing", confidence: "high", issues: [] }
  end

  def image_upload
    file = Tempfile.new([ "work-order", ".png" ])
    file.binmode
    file.write("\x89PNG\r\n\x1A\nfake image")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "image/png", true, original_filename: "work-order.png")
  end

  def with_openrouter_response(content)
    response = Struct.new(:code, :body).new("200", { choices: [ { message: { content: content } } ] }.to_json)
    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_value| }
    fake_http.define_singleton_method(:open_timeout=) { |_value| }
    fake_http.define_singleton_method(:read_timeout=) { |_value| }
    requests = []
    fake_http.define_singleton_method(:request) { |request| requests << request; response }

    previous_key = ENV["OPENROUTER_API_KEY"]
    ENV["OPENROUTER_API_KEY"] = "test-key"
    original_new = Net::HTTP.method(:new)
    begin
      Net::HTTP.define_singleton_method(:new) { |_host, _port| fake_http }
      yield requests
    ensure
      Net::HTTP.define_singleton_method(:new, original_new)
      previous_key.nil? ? ENV.delete("OPENROUTER_API_KEY") : ENV["OPENROUTER_API_KEY"] = previous_key
    end
  end

  def text_upload(text = "not image")
    file = Tempfile.new([ "work-order", ".txt" ])
    file.write(text)
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "text/plain", false, original_filename: "work-order.txt")
  end

  def binary_upload
    file = Tempfile.new([ "work-order", ".bin" ])
    file.binmode
    file.write("not supported")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "application/octet-stream", true, original_filename: "work-order.bin")
  end
end
