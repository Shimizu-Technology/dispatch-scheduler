module Api
  module V1
    class UsersController < ApplicationController
      before_action :require_admin!
      before_action :set_user, only: [ :update, :destroy, :resend_invitation ]

      def index
        render json: { users: User.order(:email).map { |user| Serializers.user(user) } }
      end

      def create
        attrs = user_params
        role = attrs[:role].to_s
        return invalid_role unless User::ROLES.include?(role)

        user = User.new(
          email: attrs[:email],
          name: attrs[:name].presence || attrs[:email].to_s.split("@").first,
          role: role,
          clerk_id: "pending_#{SecureRandom.uuid}",
          invitation_status: "pending",
          invited_by: current_user,
          invited_at: Time.current
        )

        ApplicationRecord.transaction do
          user.save!
          AuditEvent.record!(action: "user.invited", record: user, user: current_user, metadata: user_audit_metadata(user))
        end

        invitation_result = issue_invitation(user)
        render json: invite_response(user, invitation_result), status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def update
        attrs = user_params
        if attrs.key?(:role)
          role = attrs[:role].to_s
          return invalid_role unless User::ROLES.include?(role)
          @user.role = role
        end
        @user.name = attrs[:name] if attrs.key?(:name)
        if attrs.key?(:active)
          return render json: { errors: [ "Active must be true or false" ] }, status: :unprocessable_entity if attrs[:active].nil?

          @user.active = ActiveModel::Type::Boolean.new.cast(attrs[:active])
        end

        if removing_last_admin?(@user) || deactivating_last_admin?(@user)
          return render json: { errors: [ "At least one admin is required" ] }, status: :unprocessable_entity
        end

        if @user.id == current_user.id && @user.will_save_change_to_role?
          return render json: { errors: [ "Cannot change your own role" ] }, status: :unprocessable_entity
        end

        if @user.id == current_user.id && @user.will_save_change_to_active? && !@user.active?
          return render json: { errors: [ "Cannot deactivate your own account" ] }, status: :unprocessable_entity
        end

        if demoting_bootstrap_admin?(@user)
          return render json: { errors: [ "This user is a bootstrap admin. Remove their email from CLERK_BOOTSTRAP_ADMIN_EMAILS before changing their role." ] }, status: :unprocessable_entity
        end

        ApplicationRecord.transaction do
          @user.save!
          AuditEvent.record!(action: "user.updated", record: @user, user: current_user, metadata: user_audit_metadata(@user))
        end
        render json: { user: Serializers.user(@user) }
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def destroy
        if @user.id == current_user.id
          return render json: { errors: [ "Cannot delete your own account" ] }, status: :unprocessable_entity
        end

        if @user.admin? && User.where(role: "admin", active: true).where.not(id: @user.id).none?
          return render json: { errors: [ "At least one active admin is required" ] }, status: :unprocessable_entity
        end

        ApplicationRecord.transaction do
          AuditEvent.record!(action: "user.deleted", record: @user, user: current_user, metadata: user_audit_metadata(@user))
          @user.destroy!
        end
        revoke_clerk_invitation(@user)
        head :no_content
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotDestroyed => e
        render json: { errors: e.record.errors.full_messages.presence || [ e.message ] }, status: :unprocessable_entity
      end

      def resend_invitation
        unless @user.active?
          return render json: { errors: [ "Cannot resend an invitation for an inactive user" ] }, status: :unprocessable_entity
        end

        unless @user.invitation_pending?
          return render json: { errors: [ "User has already accepted their invitation" ] }, status: :unprocessable_entity
        end

        previous_invitation_id = @user.clerk_invitation_id
        invitation_result = issue_invitation(@user)
        if invitation_result.dig(:clerk, :success)
          revoke_clerk_invitation_id(previous_invitation_id) if previous_invitation_id.present? && previous_invitation_id != @user.reload.clerk_invitation_id
        end
        render json: invite_response(@user.reload, invitation_result)
      end

      private

      def set_user
        @user = User.find(params[:id])
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      end

      def user_params
        attrs = {}
        attrs[:email] = params[:email] if params.key?(:email)
        attrs[:name] = params[:name] if params.key?(:name)
        attrs[:role] = params[:role] if params.key?(:role)
        attrs[:active] = params[:active] if params.key?(:active)
        attrs
      end

      def invalid_role
        render json: { errors: [ "Role must be one of: #{User::ROLES.join(', ')}" ] }, status: :unprocessable_entity
      end

      def removing_last_admin?(user)
        user.will_save_change_to_role? && user.role_was == "admin" && user.role != "admin" && User.where(role: "admin", active: true).where.not(id: user.id).none?
      end

      def deactivating_last_admin?(user)
        user.will_save_change_to_active? && !user.active? && user.role == "admin" && User.where(role: "admin", active: true).where.not(id: user.id).none?
      end

      def demoting_bootstrap_admin?(user)
        user.will_save_change_to_role? && user.role != "admin" && Auth::RoleResolver.bootstrap_admin?(user.email)
      end

      def issue_invitation(user)
        clerk_result = create_clerk_invitation(user)
        email_result = send_invite_email(user, clerk_result[:url]) if clerk_result[:success]
        email_result ||= { sent: false, error: clerk_result[:success] ? "Invitation email was not sent" : nil }

        if clerk_result[:success]
          user.update!(invited_at: Time.current, clerk_invitation_id: clerk_result[:invitation_id])
        end

        {
          clerk: clerk_result,
          email: email_result
        }
      end

      def create_clerk_invitation(user)
        Auth::ClerkInvitationService.new.create_invitation(
          email: user.email,
          redirect_url: invitation_redirect_url,
          public_metadata: { role: user.role },
          ignore_existing: true
        )
      end

      def send_invite_email(user, invitation_url)
        UserInviteEmailService.send_invite(user: user, invited_by: current_user, invitation_url: invitation_url.presence || invitation_redirect_url)
      end

      def revoke_clerk_invitation(user)
        revoke_clerk_invitation_id(user.clerk_invitation_id)
      end

      def revoke_clerk_invitation_id(invitation_id)
        return if invitation_id.blank?

        Auth::ClerkInvitationService.new.revoke_invitation(invitation_id)
      end

      def invite_response(user, invitation_result)
        clerk_result = invitation_result[:clerk]
        email_result = invitation_result[:email]
        {
          user: Serializers.user(user),
          invitation_sent: email_result[:sent],
          invitation_error: invitation_error(clerk_result, email_result)
        }
      end

      def invitation_error(clerk_result, email_result)
        return clerk_result[:error] unless clerk_result[:success]
        return email_result[:error] unless email_result[:sent]

        nil
      end

      def invitation_redirect_url
        frontend = ENV.fetch("FRONTEND_URL", "http://localhost:5173").delete_suffix("/")
        "#{frontend}/"
      end

      def user_audit_metadata(user)
        {
          email: user.email,
          role: user.role,
          active: user.active?,
          invitation_status: user.invitation_status
        }
      end
    end
  end
end
