require "json"
require "net/http"
require "jwt"

module Auth
  class ClerkTokenVerifier
    JWKS_CACHE_KEY = "clerk_jwks".freeze
    JWKS_CACHE_TTL = 1.hour
    DEFAULT_JWKS_TIMEOUT_SECONDS = 3

    class << self
      def enabled?
        jwks_url.present?
      end

      def verify(token)
        return nil if token.blank?
        return test_payload(token) if Rails.env.test? && token.start_with?("test_token:")
        return nil unless enabled?

        decode_with_jwks(token)
      rescue JWT::DecodeError, JSON::ParserError, SystemCallError, Timeout::Error => e
        Rails.logger.warn("Clerk JWT verification failed: #{e.message}")
        nil
      end

      def jwks_url
        ENV["CLERK_JWKS_URL"].presence || domain_jwks_url
      end

      private

      def decode_with_jwks(token, force_refresh: false)
        decoded = JWT.decode(token, nil, true, algorithms: [ "RS256" ], jwks: jwks(force_refresh: force_refresh))
        decoded.first
      rescue JWT::JWKError, JWT::DecodeError => e
        raise e if force_refresh

        Rails.cache.delete(JWKS_CACHE_KEY)
        decode_with_jwks(token, force_refresh: true)
      end

      def jwks(force_refresh: false)
        Rails.cache.delete(JWKS_CACHE_KEY) if force_refresh
        Rails.cache.fetch(JWKS_CACHE_KEY, expires_in: JWKS_CACHE_TTL) do
          response = fetch_jwks
          raise JWT::DecodeError, "Unable to fetch Clerk JWKS: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

          JSON.parse(response.body)
        end
      end

      def fetch_jwks
        uri = URI(jwks_url)
        Net::HTTP.start(
          uri.host,
          uri.port,
          use_ssl: uri.scheme == "https",
          open_timeout: jwks_timeout_seconds,
          read_timeout: jwks_timeout_seconds
        ) do |http|
          http.get(uri.request_uri)
        end
      end

      def jwks_timeout_seconds
        Integer(ENV.fetch("CLERK_JWKS_TIMEOUT_SECONDS", DEFAULT_JWKS_TIMEOUT_SECONDS))
      rescue ArgumentError
        DEFAULT_JWKS_TIMEOUT_SECONDS
      end

      def domain_jwks_url
        domain = ENV["CLERK_DOMAIN"].to_s.strip
        return nil if domain.blank?

        domain = domain.sub(%r{\Ahttps?://}, "")
        "https://#{domain}/.well-known/jwks.json"
      end

      def test_payload(token)
        _prefix, clerk_id, email = token.split(":", 3)
        {
          "sub" => clerk_id.presence || "test_clerk_user",
          "email" => email.presence || "dispatcher@example.com",
          "name" => "Test User"
        }
      end
    end
  end
end
