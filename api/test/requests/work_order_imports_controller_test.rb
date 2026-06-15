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

  private

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
