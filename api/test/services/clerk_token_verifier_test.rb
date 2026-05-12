require "test_helper"

module Auth
  class ClerkTokenVerifierTest < ActiveSupport::TestCase
    test "jwks dns failures return nil instead of raising" do
      with_clerk_jwks_url do
        with_fetch_jwks_error(SocketError.new("getaddrinfo: nodename nor servname provided")) do
          assert_nil ClerkTokenVerifier.verify("jwt")
        end
      end
    end

    test "jwks tls failures return nil instead of raising" do
      with_clerk_jwks_url do
        with_fetch_jwks_error(OpenSSL::SSL::SSLError.new("certificate verify failed")) do
          assert_nil ClerkTokenVerifier.verify("jwt")
        end
      end
    end

    test "token decode failures do not force refresh jwks" do
      with_clerk_jwks_url do
        fetches = 0
        response = successful_jwks_response({ keys: [] })

        with_fetch_jwks_override(-> do
          fetches += 1
          response
        end) do
          assert_nil ClerkTokenVerifier.verify("expired.or.malformed.token")
        end

        assert_equal 1, fetches
      end
    end

    private

    def with_clerk_jwks_url
      previous_url = ENV["CLERK_JWKS_URL"]
      ENV["CLERK_JWKS_URL"] = "https://clerk.example.test/.well-known/jwks.json"
      Rails.cache.delete(ClerkTokenVerifier::JWKS_CACHE_KEY)
      yield
    ensure
      previous_url.nil? ? ENV.delete("CLERK_JWKS_URL") : ENV["CLERK_JWKS_URL"] = previous_url
      Rails.cache.delete(ClerkTokenVerifier::JWKS_CACHE_KEY)
    end

    def with_fetch_jwks_error(error)
      with_fetch_jwks_override(-> { raise error }) do
        yield
      end
    end

    def with_fetch_jwks_override(override)
      original = ClerkTokenVerifier.method(:fetch_jwks)
      ClerkTokenVerifier.define_singleton_method(:fetch_jwks, &override)
      yield
    ensure
      ClerkTokenVerifier.define_singleton_method(:fetch_jwks) { original.call }
    end

    def successful_jwks_response(body)
      Net::HTTPOK.new("1.1", "200", "OK").tap do |response|
        response.instance_variable_set(:@read, true)
        response.body = JSON.generate(body)
      end
    end
  end
end
