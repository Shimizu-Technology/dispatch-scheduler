module Auth
  class UserSync
    class AccessDenied < StandardError; end
    MAX_RETRIES = 1
    LAST_SEEN_TOUCH_INTERVAL = 5.minutes

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

        user = User.find_by(clerk_id: clerk_id)
        existing_by_email = User.find_by(email: email.downcase)

        if user.nil?
          if existing_by_email
            user = existing_by_email
            user.clerk_id = clerk_id
          elsif RoleResolver.bootstrap_admin?(email)
            user = User.new(clerk_id: clerk_id, email: email, role: "admin")
          else
            raise AccessDenied, "Your account has not been invited yet. Ask a JMI dispatch admin to invite #{email}."
          end
        elsif existing_by_email && existing_by_email.id != user.id
          raise AccessDenied, "This Clerk account is already linked to another dispatch user."
        end

        raise AccessDenied, "This dispatch user has been deactivated." if user.respond_to?(:active?) && !user.active? && !RoleResolver.bootstrap_admin?(user.email)

        user.email = email
        user.name = name if name.present?
        resolved_role = RoleResolver.role_for(email)
        user.role = resolved_role if user.new_record? || user.role.blank? || resolved_role == "admin"
        user.last_seen_at = Time.current if touch_last_seen?(user)
        if user.respond_to?(:invitation_status) && user.invitation_pending?
          user.invitation_status = "accepted"
          user.invitation_accepted_at ||= Time.current
        end
        user.save! if user.changed?
        user
      end

      def touch_last_seen?(user)
        user.new_record? || user.last_seen_at.blank? || user.last_seen_at < LAST_SEEN_TOUCH_INTERVAL.ago
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
