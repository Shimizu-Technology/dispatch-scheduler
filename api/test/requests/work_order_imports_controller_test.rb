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
    assert payload.first.fetch("import_item_id").positive?
    work_order_import = WorkOrderImport.last
    assert_equal "file", work_order_import.source_kind
    assert_equal "work-order.png", work_order_import.source_filename
    assert work_order_import.source_file.attached?
    assert_equal 1, work_order_import.items.count
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
    work_order_import = WorkOrderImport.last
    assert_equal "Door closer broken at Dededo", work_order_import.source_text
    assert_equal "pending", work_order_import.status
  end

  test "dispatcher reloads and rejects durable pending intake drafts" do
    work_order_import = WorkOrderImport.create!(
      user: dispatcher_user,
      source_kind: "pasted_text",
      source_text: "Leaking pipe",
      source_sha256: "abc123",
      extraction_model: "test-model",
      extracted_at: Time.current
    )
    item = work_order_import.items.create!(position: 0, extracted_data: {
      client: "Mobil", location: "Yigo", region: "North", source: "pasted_text",
      title: "Pipe leak", description: "Leaking pipe", priority: "P2",
      status: "needs_assessment", trade_category: "Plumbing", confidence: "medium", issues: []
    })

    with_auth_env do
      get "/api/v1/work_order_imports", headers: auth_headers
    end
    assert_response :success
    payload = JSON.parse(response.body).fetch("work_orders")
    assert_equal [ item.id ], payload.map { |draft| draft.fetch("import_item_id") }

    with_auth_env do
      post "/api/v1/work_order_import_items/#{item.id}/reject", headers: auth_headers
    end
    assert_response :no_content
    assert_equal "rejected", item.reload.status
    assert_equal "rejected", work_order_import.reload.status
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

  test "does not persist an empty successful extraction" do
    original_extract = WorkOrderOcrExtractor.method(:extract)
    begin
      WorkOrderOcrExtractor.define_singleton_method(:extract) { |_file = nil, **_kwargs| { success: true, work_orders: [], raw_response: "{\"work_orders\":[]}" } }
      with_auth_env do
        post "/api/v1/work_order_imports/preview", params: { file: image_upload }, headers: auth_headers
      end
    ensure
      WorkOrderOcrExtractor.define_singleton_method(:extract, original_extract)
    end

    assert_response :unprocessable_entity
    assert_equal [ "No readable work-order requests were found in that source." ], JSON.parse(response.body).fetch("errors")
    assert_equal 0, WorkOrderImport.count
  end

  test "rejects ambiguous file and pasted text intake" do
    with_auth_env do
      post "/api/v1/work_order_imports/preview", params: { file: image_upload, text: "Use this instead" }, headers: auth_headers
    end

    assert_response :unprocessable_entity
    assert_equal [ "Choose either one file or pasted text for each intake." ], JSON.parse(response.body).fetch("errors")
    assert_equal 0, WorkOrderImport.count
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

  def dispatcher_user
    User.find_or_create_by!(clerk_id: "dispatcher_imports_123") do |user|
      user.email = "dispatcher-imports@example.com"
      user.role = "dispatcher"
    end
  end
end
