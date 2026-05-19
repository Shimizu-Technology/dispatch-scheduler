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
    result = WorkOrderOcrExtractor.extract(text_upload)

    assert_equal false, result[:success]
    assert_includes result[:error], "Unsupported file type"
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

  def text_upload
    file = Tempfile.new([ "work-order", ".txt" ])
    file.write("not image")
    file.rewind
    Rack::Test::UploadedFile.new(file.path, "text/plain", false, original_filename: "work-order.txt")
  end
end
