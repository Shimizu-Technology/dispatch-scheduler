module Auth
  class RoleResolver
    DEFAULT_ROLE = "viewer"

    class << self
      def role_for(email)
        normalized = email.to_s.downcase.strip
        return "admin" if list("CLERK_ADMIN_EMAILS").include?(normalized)
        return "dispatcher" if list("CLERK_DISPATCHER_EMAILS").include?(normalized)

        DEFAULT_ROLE
      end

      def allowed?(email)
        normalized = email.to_s.downcase.strip
        allowed_emails = list("CLERK_ALLOWED_EMAILS")
        allowed_domains = list("CLERK_ALLOWED_DOMAINS")
        return true if allowed_emails.empty? && allowed_domains.empty?
        return true if allowed_emails.include?(normalized)

        domain = normalized.split("@", 2).last
        allowed_domains.include?(domain)
      end

      private

      def list(key)
        ENV.fetch(key, "").split(",").map { |value| value.downcase.strip }.reject(&:blank?)
      end
    end
  end
end
