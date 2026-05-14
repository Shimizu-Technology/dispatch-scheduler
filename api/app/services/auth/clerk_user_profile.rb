require "json"
require "net/http"
require "openssl"
require "erb"

module Auth
  class ClerkUserProfile
    API_BASE_URL = "https://api.clerk.com/v1".freeze
    DEFAULT_TIMEOUT_SECONDS = 3

    class << self
      def fetch(clerk_id)
        return {} if clerk_id.blank? || secret_key.blank?

        response = fetch_user(clerk_id)
        return {} unless response.is_a?(Net::HTTPSuccess)

        parse_user(JSON.parse(response.body))
      rescue JSON::ParserError, SystemCallError, Timeout::Error, SocketError, OpenSSL::SSL::SSLError => e
        Rails.logger.warn("Clerk user profile fetch failed: #{e.message}")
        {}
      end

      private

      def fetch_user(clerk_id)
        uri = URI("#{API_BASE_URL}/users/#{ERB::Util.url_encode(clerk_id)}")
        Net::HTTP.start(
          uri.host,
          uri.port,
          use_ssl: true,
          open_timeout: timeout_seconds,
          read_timeout: timeout_seconds
        ) do |http|
          request = Net::HTTP::Get.new(uri)
          request["Authorization"] = "Bearer #{secret_key}"
          request["Content-Type"] = "application/json"
          http.request(request)
        end
      end

      def parse_user(data)
        email = primary_email(data)
        first_name = data["first_name"] || data["firstName"]
        last_name = data["last_name"] || data["lastName"]
        name = data["full_name"] || data["fullName"] || [ first_name, last_name ].compact.join(" ").presence

        { "email" => email, "name" => name }.compact
      end

      def primary_email(data)
        emails = Array(data["email_addresses"] || data["emailAddresses"])
        primary_id = data["primary_email_address_id"] || data["primaryEmailAddressId"]
        primary = emails.find { |email| (email["id"] || email[:id]).to_s == primary_id.to_s } || emails.first
        primary&.fetch("email_address", nil) || primary&.fetch("emailAddress", nil)
      end

      def secret_key
        ENV["CLERK_SECRET_KEY"].to_s.strip.presence
      end

      def timeout_seconds
        Integer(ENV.fetch("CLERK_API_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
      rescue ArgumentError
        DEFAULT_TIMEOUT_SECONDS
      end
    end
  end
end
