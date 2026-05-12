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
      original = ClerkTokenVerifier.method(:fetch_jwks)
      ClerkTokenVerifier.define_singleton_method(:fetch_jwks) { raise error }
      yield
    ensure
      ClerkTokenVerifier.define_singleton_method(:fetch_jwks) { original.call }
    end
  end
end
