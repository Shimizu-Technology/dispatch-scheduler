require "base64"
require "json"
require "net/http"
require "pdf/reader"
require "stringio"
require "uri"

class WorkOrderOcrExtractor
  OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
  DEFAULT_MODEL = "google/gemini-2.5-flash"
  MAX_FILE_SIZE = 10.megabytes
  SUPPORTED_IMAGE_CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze
  SUPPORTED_TEXT_CONTENT_TYPES = %w[application/pdf text/plain].freeze
  SUPPORTED_CONTENT_TYPES = (SUPPORTED_IMAGE_CONTENT_TYPES + SUPPORTED_TEXT_CONTENT_TYPES).freeze

  PROMPT = <<~PROMPT
    You are extracting JMI Guam facilities work orders from a work-order image, PDF text, pasted email, or WhatsApp message.
    Extract every distinct work order request that is visible. Do not invent details.

    Return ONLY minified valid JSON with this exact shape:
    {"work_orders":[{"client":"Mobil","location":"Yigo station","region":"North","external_id":"WO-123 or null","source":"upload","title":"Short title","description":"Full readable scope/request","priority":"P1|P2|P3|P4","status":"approved|needs_assessment|new|waiting_for_parts|waiting_for_approval","trade_category":"General|Plumbing|HVAC|Electrical|Carpentry|Painting|Landscaping|Masonry","scheduled_date":"YYYY-MM-DD or null","reported_at":"ISO8601 or null","notes":"Requester/access/extra notes or null","pa_project":false,"pa_project_notes":"parts/materials/follow-up details or null","corrective_maintenance":false,"estimate_required":false,"estimate_number":"estimate/quote number or null","parts_status":"needed|ordered|arrived|not_required or readable text/null","parts_ordered":false,"parts_ordered_at":"ISO8601 or null","parts_eta":"YYYY-MM-DD or null","follow_up_due_on":"YYYY-MM-DD or null","follow_up_owner":"person/vendor responsible or null","vendor_reference":"PO/order/quote/vendor ref or null","latest_follow_up_note":"latest follow-up note or null","confidence":"high|medium|low","issues":["short review issue"]}]}

    Rules:
    - Prefer literal text from the source over guessing.
    - Default client to "Mobil" only if the source clearly appears to be a Mobil/JMI station request; otherwise use "Manual".
    - If location is unclear, use "Unknown" and add an issue.
    - Choose priority from visible urgency. If unknown, use P3.
    - Choose trade_category from the work described; use General when unclear.
    - Use needs_assessment when the work needs inspection before scheduling; approved when it looks ready to dispatch.
    - Keep title short, operational, and useful for dispatch.
    - If the source mentions parts, approval, estimate, quote, PA Projects, vendor/order numbers, or promised dates, capture those in the structured follow-up fields.
    - Do not set scheduled_date unless the request explicitly says it is scheduled for a date.
    - If no requests are readable, return {"work_orders":[]}.
  PROMPT

  class << self
    def extract(uploaded_file = nil, text: nil)
      if text.present?
        return extract_from_text(text, source_label: "pasted intake text", default_source: "pasted_text")
      end

      validation_error = validate_upload(uploaded_file)
      return { success: false, error: validation_error } if validation_error

      content_type = detected_content_type(uploaded_file)
      if SUPPORTED_IMAGE_CONTENT_TYPES.include?(content_type)
        extract_from_image(uploaded_file, content_type)
      elsif content_type == "application/pdf"
        extracted_text = extract_pdf_text(uploaded_file)
        return { success: false, error: "This PDF does not contain readable text. Upload a screenshot/image of the work order instead." } if extracted_text.blank?

        extract_from_text(extracted_text, source_label: "PDF text from #{uploaded_file.original_filename}", default_source: "pdf_upload")
      else
        uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
        extract_from_text(uploaded_file.read.to_s, source_label: "uploaded text file", default_source: "text_upload")
      end
    end

    def extract_from_text(text, source_label:, default_source: "pasted_text")
      return { success: false, error: "Paste work-order text before previewing intake." } if text.to_s.strip.blank?

      api_key = ENV["OPENROUTER_API_KEY"]
      return { success: false, error: "OpenRouter API key not configured" } if api_key.blank?

      payload = {
        model: ENV.fetch("OPENROUTER_WORK_ORDER_OCR_MODEL", DEFAULT_MODEL),
        messages: [
          {
            role: "user",
            content: "#{PROMPT}\n\nSource: #{source_label}\n\nDefault source value if no source is visible: #{default_source}\n\nWORK ORDER TEXT:\n#{text.to_s.first(20_000)}"
          }
        ],
        temperature: 0.05,
        max_tokens: 5000
      }

      normalize_openrouter_response(perform_openrouter_request(payload, api_key))
    end

    private

    def extract_from_image(uploaded_file, content_type)
      api_key = ENV["OPENROUTER_API_KEY"]
      return { success: false, error: "OpenRouter API key not configured" } if api_key.blank?

      payload = {
        model: ENV.fetch("OPENROUTER_WORK_ORDER_OCR_MODEL", DEFAULT_MODEL),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: data_url(uploaded_file, content_type) } }
            ]
          }
        ],
        temperature: 0.05,
        max_tokens: 5000
      }

      normalize_openrouter_response(perform_openrouter_request(payload, api_key))
    end

    def normalize_openrouter_response(response)
      return response if response[:success] == false

      parsed = parse_json_content(response[:content].to_s)
      return parsed if parsed[:success] == false

      rows = parsed.dig(:data, "work_orders")
      rows = [] unless rows.is_a?(Array)

      { success: true, work_orders: rows.first(25).map { |row| normalize_row(row) }, raw_response: response[:content].to_s }
    end

    def validate_upload(uploaded_file)
      return "Upload a JPG, PNG, WebP, PDF, or text file of the work order." if uploaded_file.blank?
      return "File is too large. Upload a file under 10MB." if uploaded_file.size.to_i > MAX_FILE_SIZE
      return "Unsupported file type. Upload a JPG, PNG, WebP, PDF, or text file." unless SUPPORTED_CONTENT_TYPES.include?(detected_content_type(uploaded_file))

      nil
    end

    def data_url(uploaded_file, content_type)
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      encoded = Base64.strict_encode64(uploaded_file.read)
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      "data:#{content_type};base64,#{encoded}"
    end

    def detected_content_type(uploaded_file)
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      header = uploaded_file.read(16).to_s.b
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)

      if header.start_with?("\xFF\xD8\xFF".b)
        "image/jpeg"
      elsif header.start_with?("\x89PNG\r\n\x1A\n".b)
        "image/png"
      elsif header[0, 4] == "RIFF" && header[8, 4] == "WEBP"
        "image/webp"
      elsif header.start_with?("%PDF".b)
        "application/pdf"
      elsif uploaded_file.respond_to?(:content_type) && uploaded_file.content_type == "text/plain"
        "text/plain"
      end
    end

    def extract_pdf_text(uploaded_file)
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      io = StringIO.new(uploaded_file.read)
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      PDF::Reader.new(io).pages.map(&:text).join("\n").squish
    rescue PDF::Reader::MalformedPDFError, PDF::Reader::UnsupportedFeatureError, ArgumentError => e
      Rails.logger.warn("[WorkOrderOcrExtractor] PDF text extraction failed: #{e.class}: #{e.message}")
      ""
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
        reported_at: normalize_time_value(source["reported_at"]),
        notes: source["notes"].to_s.squish.presence,
        pa_project: boolean_value(source["pa_project"]),
        pa_project_notes: source["pa_project_notes"].to_s.squish.presence,
        corrective_maintenance: boolean_value(source["corrective_maintenance"]),
        estimate_required: boolean_value(source["estimate_required"]),
        estimate_number: source["estimate_number"].to_s.squish.presence,
        parts_status: source["parts_status"].to_s.squish.presence,
        parts_ordered: boolean_value(source["parts_ordered"]),
        parts_ordered_at: normalize_time_value(source["parts_ordered_at"]),
        parts_eta: normalize_date(source["parts_eta"]),
        follow_up_due_on: normalize_date(source["follow_up_due_on"]),
        follow_up_owner: source["follow_up_owner"].to_s.squish.presence,
        vendor_reference: source["vendor_reference"].to_s.squish.presence,
        latest_follow_up_note: source["latest_follow_up_note"].to_s.squish.presence,
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

    def normalize_time_value(value)
      return nil if value.blank?

      Time.zone.parse(value.to_s)&.iso8601
    rescue ArgumentError
      nil
    end

    def boolean_value(value)
      ActiveModel::Type::Boolean.new.cast(value) || false
    end
  end
end
