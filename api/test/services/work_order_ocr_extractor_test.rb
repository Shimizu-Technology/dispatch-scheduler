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

  test "rejects oversized pasted text before calling OpenRouter" do
    result = WorkOrderOcrExtractor.extract(nil, text: "x" * (WorkOrderOcrExtractor::MAX_TEXT_LENGTH + 1))

    assert_equal false, result[:success]
    assert_includes result[:error], "20,000 characters"
  end

  test "pdf uploads use OpenRouter file parsing instead of embedded text extraction" do
    seen_payload = nil
    result = nil
    with_openrouter_response({ work_orders: [ { title: "Encoded PDF issue", description: "Readable through OCR", priority: "P4", status: "approved", trade_category: "Painting" } ] }.to_json, on_request: ->(request) { seen_payload = JSON.parse(request.body) }) do
      result = WorkOrderOcrExtractor.extract(pdf_upload)
    end

    assert_equal true, result[:success], result.inspect
    content = seen_payload.dig("messages", 0, "content")
    file_part = content.find { |part| part["type"] == "file" }
    assert_equal "work-order.pdf", file_part.dig("file", "filename")
    assert_match %r{\Adata:application/pdf;base64,}, file_part.dig("file", "file_data")
    assert_equal "file-parser", seen_payload.dig("plugins", 0, "id")
    assert_equal "mistral-ocr", seen_payload.dig("plugins", 0, "pdf", "engine")
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

  private

  def image_upload
    file = Tempfile.new([ "work-order", ".png" ])
    file.binmode
    file.write("\x89PNG\r\n\x1A\nfake image")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "image/png", true, original_filename: "work-order.png")
  end

  def with_openrouter_response(content, on_request: nil)
    response = Struct.new(:code, :body).new("200", { choices: [ { message: { content: content } } ] }.to_json)
    fake_http = Object.new
    fake_http.define_singleton_method(:use_ssl=) { |_value| }
    fake_http.define_singleton_method(:open_timeout=) { |_value| }
    fake_http.define_singleton_method(:read_timeout=) { |_value| }
    fake_http.define_singleton_method(:request) do |request|
      on_request&.call(request)
      response
    end

    previous_key = ENV["OPENROUTER_API_KEY"]
    ENV["OPENROUTER_API_KEY"] = "test-key"
    original_new = Net::HTTP.method(:new)
    begin
      Net::HTTP.define_singleton_method(:new) { |_host, _port| fake_http }
      yield
    ensure
      Net::HTTP.define_singleton_method(:new, original_new)
      previous_key.nil? ? ENV.delete("OPENROUTER_API_KEY") : ENV["OPENROUTER_API_KEY"] = previous_key
    end
  end

  def text_upload
    file = Tempfile.new([ "work-order", ".txt" ])
    file.write("not image")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "text/plain", false, original_filename: "work-order.txt")
  end

  def pdf_upload
    file = Tempfile.new([ "work-order", ".pdf" ])
    file.binmode
    file.write("%PDF-1.6\nencoded work order")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "application/pdf", true, original_filename: "work-order.pdf")
  end

  def binary_upload
    file = Tempfile.new([ "work-order", ".bin" ])
    file.binmode
    file.write("not supported")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "application/octet-stream", true, original_filename: "work-order.bin")
  end
end
