module Auth
  class RoleResolver
    DEFAULT_ROLE = "viewer"

    class << self
      def role_for(email)
        normalized = email.to_s.downcase.strip
        return "admin" if bootstrap_admin?(normalized)

        DEFAULT_ROLE
      end

      def bootstrap_admin?(email)
        bootstrap_admin_emails.include?(email.to_s.downcase.strip)
      end

      private

      def bootstrap_admin_emails
        list("CLERK_BOOTSTRAP_ADMIN_EMAILS")
      end

      def list(key)
        ENV.fetch(key, "").split(",").map { |value| value.downcase.strip }.reject(&:blank?)
      end
    end
  end
end
