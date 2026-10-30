require "test_helper"
require "tempfile"

class WorkOrderImportsControllerTest < ActionDispatch::IntegrationTest
  test "dispatcher previews uploaded work order image" do
    upload = image_upload
    extractor_response = {
      success: true,
      work_orders: [
        {
          client: "Mobil",
          location: "Yigo",
          region: "North",
          external_id: "WO-900",
          source: "upload",
          title: "Sink leak",
          description: "Bathroom sink leaking",
          priority: "P2",
          normalized_priority: "P2",
          status: "approved",
          original_status_text: "approved",
          trade_category: "Plumbing",
          scheduled_date: DEFAULT_DATE.to_s,
          notes: "Manager called it in",
          confidence: "high",
          issues: []
        }
      ]
    }

    original_extract = WorkOrderOcrExtractor.method(:extract)
    seen_filename = nil
    seen_text = :not_seen
    begin
      WorkOrderOcrExtractor.define_singleton_method(:extract) do |file = nil, **kwargs|
        seen_filename = file.original_filename
        seen_text = kwargs[:text]
        extractor_response
      end
      with_auth_env do
        post "/api/v1/work_order_imports/preview", params: { file: upload }, headers: auth_headers
      end
    ensure
      WorkOrderOcrExtractor.define_singleton_method(:extract, original_extract)
    end

    assert_equal "work-order.png", seen_filename
    assert_nil seen_text
    assert_response :success
    payload = JSON.parse(response.body).fetch("work_orders")
    assert_equal 1, payload.size
    assert_equal "WO-900", payload.first.fetch("external_id")
    assert_equal "Sink leak", payload.first.fetch("title")
    assert_not JSON.parse(response.body).key?("warnings")
  end

  test "dispatcher previews pasted intake text" do
    extractor_response = {
      success: true,
      work_orders: [
        {
          client: "Mobil",
          location: "Dededo",
          region: "North",
          external_id: nil,
          source: "pasted_text",
          title: "Door closer broken",
          description: "WhatsApp note says door closer broken",
          priority: "P3",
          normalized_priority: "P3",
          status: "needs_assessment",
          trade_category: "General",
          scheduled_date: nil,
          reported_at: nil,
          notes: "Pasted from WhatsApp",
          confidence: "medium",
          issues: []
        }
      ]
    }

    original_extract = WorkOrderOcrExtractor.method(:extract)
    seen_text = nil
    begin
      WorkOrderOcrExtractor.define_singleton_method(:extract) do |_file = nil, **kwargs|
        seen_text = kwargs[:text]
        extractor_response
      end
      with_auth_env do
        post "/api/v1/work_order_imports/preview", params: { text: "Door closer broken at Dededo" }, headers: auth_headers
      end
    ensure
      WorkOrderOcrExtractor.define_singleton_method(:extract, original_extract)
    end

    assert_equal "Door closer broken at Dededo", seen_text
    assert_response :success
    payload = JSON.parse(response.body).fetch("work_orders")
    assert_equal "pasted_text", payload.first.fetch("source")
    assert_equal "Door closer broken", payload.first.fetch("title")
  end

  test "viewer cannot preview work order uploads" do
    with_auth_env do
      post "/api/v1/work_order_imports/preview", params: { file: image_upload }, headers: auth_headers("viewer_imports_123", "viewer-imports@example.com")
    end

    assert_response :forbidden
  end

  test "returns extractor errors" do
    original_extract = WorkOrderOcrExtractor.method(:extract)
    begin
      WorkOrderOcrExtractor.define_singleton_method(:extract) { |_file = nil, **_kwargs| { success: false, error: "OpenRouter API key not configured" } }
      with_auth_env do
        post "/api/v1/work_order_imports/preview", params: { file: image_upload }, headers: auth_headers
      end
    ensure
      WorkOrderOcrExtractor.define_singleton_method(:extract, original_extract)
    end

    assert_response :unprocessable_entity
    assert_equal [ "OpenRouter API key not configured" ], JSON.parse(response.body).fetch("errors")
  end

  test "returns optional extraction cap warnings with the preview rows" do
    warnings = [ "Only the first 25 requests are shown; split the remaining requests." ]
    original_extract = WorkOrderOcrExtractor.method(:extract)
    begin
      WorkOrderOcrExtractor.define_singleton_method(:extract) { |_file = nil, **_kwargs| { success: true, work_orders: [], warnings: warnings } }
      with_auth_env do
        post "/api/v1/work_order_imports/preview", params: { text: "Synthetic batch" }, headers: auth_headers
      end
    ensure
      WorkOrderOcrExtractor.define_singleton_method(:extract, original_extract)
    end
    assert_response :success
    assert_equal warnings, JSON.parse(response.body).fetch("warnings")
    assert_equal [], JSON.parse(response.body).fetch("work_orders")
  end

  test "rejects oversized text through the real extraction guard" do
    with_auth_env do
      post "/api/v1/work_order_imports/preview", params: { text: "x" * 20_001 }, headers: auth_headers
    end
    assert_response :unprocessable_entity
    assert_includes JSON.parse(response.body).fetch("errors").first, "Split"
  end

  test "malformed provider content returns 422 without creating operational records" do
    headers = auth_headers
    [ [], "synthetic", nil, {}, { work_orders: [ { title: "Real proposal" }, false ] } ].each do |data|
      with_provider_content(data.to_json) do
        with_auth_env do
          assert_no_difference [ "WorkOrder.count", "PmTask.count", "Client.count", "Location.count" ] do
            post "/api/v1/work_order_imports/preview", params: { text: "Keep this source for retry" }, headers: headers
          end
        end
      end
      assert_response :unprocessable_entity
      payload = JSON.parse(response.body)
      assert_includes payload.fetch("errors").first, "invalid structure"
      assert_not payload.key?("work_orders")
    end
  end

  test "legitimate empty provider content remains a successful preview with no writes" do
    with_provider_content({ work_orders: [] }.to_json) do
      with_auth_env do
        assert_no_difference "WorkOrder.count" do
          post "/api/v1/work_order_imports/preview", params: { text: "No requests here" }, headers: auth_headers
        end
      end
    end
    assert_response :success
    assert_equal [], JSON.parse(response.body).fetch("work_orders")
  end

  private

  def with_provider_content(content)
    response = Struct.new(:code, :body).new("200", { choices: [ { message: { content: content } } ] }.to_json)
    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_value| }
    fake_http.define_singleton_method(:open_timeout=) { |_value| }
    fake_http.define_singleton_method(:read_timeout=) { |_value| }
    fake_http.define_singleton_method(:request) { |_request| response }
    original_new = Net::HTTP.method(:new)
    previous_key = ENV["OPENROUTER_API_KEY"]
    ENV["OPENROUTER_API_KEY"] = "test-key"
    Net::HTTP.define_singleton_method(:new) { |_host, _port| fake_http }
    yield
  ensure
    Net::HTTP.define_singleton_method(:new, original_new)
    previous_key.nil? ? ENV.delete("OPENROUTER_API_KEY") : ENV["OPENROUTER_API_KEY"] = previous_key
  end

  def image_upload
    file = Tempfile.new([ "work-order", ".png" ])
    file.binmode
    file.write("\x89PNG\r\n\x1A\nfake image")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "image/png", true, original_filename: "work-order.png")
  end

  def with_auth_env
    previous = ENV["CLERK_JWKS_URL"]
    ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
    yield
  ensure
    previous.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous
  end

  def auth_headers(clerk_id = "dispatcher_imports_123", email = "dispatcher-imports@example.com")
    User.find_or_create_by!(clerk_id: clerk_id) do |user|
      user.email = email
      user.role = email.start_with?("viewer") ? "viewer" : "dispatcher"
    end
    { "Authorization" => "Bearer test_token:#{clerk_id}:#{email}" }
  end
end
