require "json"
require "net/http"
require "openssl"

module Auth
  class ClerkInvitationService
    BASE_URL = "https://api.clerk.com/v1".freeze
    DEFAULT_TIMEOUT_SECONDS = 5

    def initialize(secret_key: ENV["CLERK_SECRET_KEY"])
      @secret_key = secret_key.to_s.strip
    end

    def configured?
      @secret_key.present?
    end

    def create_invitation(email:, redirect_url:, public_metadata: {}, ignore_existing: true)
      return { success: false, error: "CLERK_SECRET_KEY is not configured" } unless configured?

      response = post_json("/invitations", {
        email_address: email,
        redirect_url: redirect_url,
        notify: false,
        ignore_existing: ignore_existing,
        public_metadata: public_metadata
      })

      if response.is_a?(Net::HTTPSuccess)
        payload = JSON.parse(response.body)
        { success: true, invitation_id: payload["id"], status: payload["status"], url: payload["url"] }
      else
        { success: false, error: error_message(response), status_code: response.code.to_i }
      end
    rescue JSON::ParserError, SystemCallError, Timeout::Error, SocketError, OpenSSL::SSL::SSLError => e
      Rails.logger.warn("Clerk invitation failed for #{email}: #{e.class} #{e.message}")
      { success: false, error: "Could not create Clerk invitation: #{e.message}" }
    end

    def revoke_invitation(invitation_id)
      return { success: false, error: "CLERK_SECRET_KEY is not configured" } unless configured?
      return { success: true } if invitation_id.blank?

      response = post_json("/invitations/#{invitation_id}/revoke", {})
      response.is_a?(Net::HTTPSuccess) ? { success: true } : { success: false, error: error_message(response) }
    rescue JSON::ParserError, SystemCallError, Timeout::Error, SocketError, OpenSSL::SSL::SSLError => e
      Rails.logger.warn("Clerk invitation revoke failed for #{invitation_id}: #{e.class} #{e.message}")
      { success: false, error: e.message }
    end

    private

    def post_json(path, body)
      uri = URI("#{BASE_URL}#{path}")
      Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: timeout_seconds, read_timeout: timeout_seconds) do |http|
        request = Net::HTTP::Post.new(uri)
        request["Authorization"] = "Bearer #{@secret_key}"
        request["Content-Type"] = "application/json"
        request.body = body.to_json
        http.request(request)
      end
    end

    def error_message(response)
      payload = JSON.parse(response.body) rescue {}
      errors = payload["errors"]
      return errors.map { |error| error["long_message"] || error["message"] }.compact.join("; ") if errors.is_a?(Array) && errors.any?

      payload["message"].presence || "Clerk API error #{response.code}"
    end

    def timeout_seconds
      Integer(ENV.fetch("CLERK_API_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    rescue ArgumentError
      DEFAULT_TIMEOUT_SECONDS
    end
  end
end
