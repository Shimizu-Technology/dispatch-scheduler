require "base64"
require "json"
require "net/http"
require "uri"

class WorkOrderOcrExtractor
  OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
  DEFAULT_MODEL = "google/gemini-2.5-flash"
  MAX_FILE_SIZE = 8.megabytes
  SUPPORTED_CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze

  PROMPT = <<~PROMPT
    You are extracting JMI Guam facilities work orders from an uploaded image.
    The image may be a work order screenshot, a photographed paper request, or a WhatsApp/email screenshot.
    Extract every distinct work order request that is visible. Do not invent details.

    Return ONLY minified valid JSON with this exact shape:
    {"work_orders":[{"client":"Mobil","location":"Yigo station","region":"North","external_id":"WO-123 or null","source":"upload","title":"Short title","description":"Full readable scope/request","priority":"P1|P2|P3|P4","status":"approved|needs_assessment|new|waiting_for_parts|waiting_for_approval","trade_category":"General|Plumbing|HVAC|Electrical|Carpentry|Painting|Landscaping|Masonry","scheduled_date":"YYYY-MM-DD or null","notes":"Requester/access/extra notes or null","confidence":"high|medium|low","issues":["short review issue"]}]}

    Rules:
    - Prefer literal text from the image over guessing.
    - Default client to "Mobil" only if the image clearly appears to be a Mobil/JMI station request; otherwise use "Manual".
    - If location is unclear, use "Unknown" and add an issue.
    - Choose priority from visible urgency. If unknown, use P3.
    - Choose trade_category from the work described; use General when unclear.
    - Use needs_assessment when the work needs inspection before scheduling; approved when it looks ready to dispatch.
    - Keep title short, operational, and useful for dispatch.
    - If no requests are readable, return {"work_orders":[]}.
  PROMPT

  class << self
    def extract(uploaded_file)
      validation_error = validate_upload(uploaded_file)
      return { success: false, error: validation_error } if validation_error

      api_key = ENV["OPENROUTER_API_KEY"]
      return { success: false, error: "OpenRouter API key not configured" } if api_key.blank?

      payload = {
        model: ENV.fetch("OPENROUTER_WORK_ORDER_OCR_MODEL", DEFAULT_MODEL),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: data_url(uploaded_file) } }
            ]
          }
        ],
        temperature: 0.05,
        max_tokens: 5000
      }

      response = perform_openrouter_request(payload, api_key)
      return response if response[:success] == false

      parsed = parse_json_content(response[:content].to_s)
      return parsed if parsed[:success] == false

      rows = parsed.dig(:data, "work_orders")
      rows = [] unless rows.is_a?(Array)

      { success: true, work_orders: rows.first(25).map { |row| normalize_row(row) }, raw_response: response[:content].to_s }
    end

    private

    def validate_upload(uploaded_file)
      return "Upload a JPG, PNG, or WebP image of the work order." if uploaded_file.blank?
      return "File is too large. Upload an image under 8MB." if uploaded_file.size.to_i > MAX_FILE_SIZE
      return "Unsupported file type. Upload a JPG, PNG, or WebP image." unless SUPPORTED_CONTENT_TYPES.include?(uploaded_file.content_type)

      nil
    end

    def data_url(uploaded_file)
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      encoded = Base64.strict_encode64(uploaded_file.read)
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      "data:#{uploaded_file.content_type};base64,#{encoded}"
    end

    def perform_openrouter_request(payload, api_key)
      uri = URI(OPENROUTER_URL)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 15
      http.read_timeout = 60

      request = Net::HTTP::Post.new(uri.request_uri, {
        "Authorization" => "Bearer #{api_key}",
        "Content-Type" => "application/json",
        "HTTP-Referer" => ENV.fetch("OPENROUTER_HTTP_REFERER", "https://dispatch-scheduler.shimizu-technology.com"),
        "X-Title" => "JMI Dispatch Work Order OCR"
      })
      request.body = payload.to_json

      response = http.request(request)
      return { success: false, error: "OpenRouter API error: #{response.code}", raw_response: response.body } unless response.code.to_i == 200

      json = JSON.parse(response.body)
      content = json.dig("choices", 0, "message", "content")
      return { success: false, error: "No work order data extracted" } if content.blank?

      { success: true, content: content }
    rescue JSON::ParserError
      { success: false, error: "Invalid OpenRouter response format" }
    rescue StandardError => e
      Rails.logger.error("[WorkOrderOcrExtractor] #{e.class}: #{e.message}")
      { success: false, error: "Unable to extract work orders from upload" }
    end

    def parse_json_content(content)
      clean = content.strip.gsub(/\A```json\s*/, "").gsub(/\s*```\z/, "")
      parsed = JSON.parse(clean)
      { success: true, data: parsed }
    rescue JSON::ParserError => e
      Rails.logger.error("[WorkOrderOcrExtractor] JSON parse error: #{e.message}")
      { success: false, error: "Could not parse extracted work order data", raw_response: content }
    end

    def normalize_row(row)
      source = row.is_a?(Hash) ? row : {}
      priority = source["priority"].presence_in(%w[P1 P2 P3 P4]) || "P3"
      status = source["status"].presence_in(%w[new needs_assessment approved scheduled waiting_for_parts waiting_for_approval]) || "needs_assessment"
      trade = source["trade_category"].presence_in(%w[General Plumbing HVAC Electrical Carpentry Painting Landscaping Masonry]) || "General"
      description = source["description"].to_s.squish
      title = source["title"].to_s.squish.presence || description.truncate(60)
      location = source["location"].to_s.squish.presence || "Unknown"

      {
        client: source["client"].to_s.squish.presence || "Manual",
        location: location,
        region: source["region"].to_s.squish.presence || "Unknown",
        external_id: source["external_id"].to_s.squish.presence,
        source: source["source"].to_s.squish.presence || "upload",
        title: title.presence || "Uploaded work order",
        description: description.presence || title.presence || "Uploaded work order needs review",
        priority: priority,
        normalized_priority: priority,
        status: status,
        original_status_text: status,
        trade_category: trade,
        scheduled_date: normalize_date(source["scheduled_date"]),
        notes: source["notes"].to_s.squish.presence,
        confidence: source["confidence"].presence_in(%w[high medium low]) || "low",
        issues: Array(source["issues"]).map { |issue| issue.to_s.squish }.reject(&:blank?)
      }
    end

    def normalize_date(value)
      return nil if value.blank?

      Date.parse(value.to_s).iso8601
    rescue Date::Error
      nil
    end
  end
end
