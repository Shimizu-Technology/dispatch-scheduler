module Auth
  class UserSync
    class AccessDenied < StandardError; end
    MAX_RETRIES = 1

    class << self
      def call(payload)
        attempts = 0

        begin
          sync_user(payload)
        rescue ActiveRecord::RecordNotUnique, ActiveRecord::StatementInvalid
          attempts += 1
          raise if attempts > MAX_RETRIES

          retry
        end
      end

      private

      def sync_user(payload)
        clerk_id = payload["sub"].to_s
        clerk_profile = {}
        email = email_from(payload)
        if email.blank? && clerk_id.present?
          clerk_profile = ClerkUserProfile.fetch(clerk_id)
          email = email_from(clerk_profile)
        end

        name = name_from(payload).presence || name_from(clerk_profile)

        raise AccessDenied, "Missing Clerk user id" if clerk_id.blank?
        raise AccessDenied, "Missing Clerk email. Set CLERK_SECRET_KEY or configure Clerk token email claims." if email.blank?

        user = User.find_or_initialize_by(clerk_id: clerk_id)
        if user.new_record? && (existing = User.find_by(email: email.downcase))
          user = existing
          user.clerk_id = clerk_id
        end

        user.email = email
        user.name = name if name.present?
        resolved_role = RoleResolver.role_for(email)
        user.role = resolved_role if user.new_record? || user.role.blank? || resolved_role == "admin"
        user.last_seen_at = Time.current
        user.save!
        user
      end

      def email_from(payload)
        value = payload["email"] || payload["primary_email_address"] || payload.dig("claims", "email")
        value.to_s.downcase.strip.presence
      end

      def name_from(payload)
        payload["name"].presence || [ payload["first_name"], payload["last_name"] ].compact.join(" ").presence
      end
    end
  end
end
