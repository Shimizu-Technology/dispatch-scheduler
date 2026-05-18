module Api
  module V1
    class UsersController < ApplicationController
      before_action :require_admin!

      def index
        render json: { users: User.order(:email).map { |user| Serializers.user(user) } }
      end

      def update
        user = User.find(params[:id])
        role = params[:role].to_s
        unless User::ROLES.include?(role)
          return render json: { errors: [ "Role must be one of: #{User::ROLES.join(', ')}" ] }, status: :unprocessable_entity
        end

        user.role = role

        if removing_last_admin?(user)
          return render json: { errors: [ "At least one admin is required" ] }, status: :unprocessable_entity
        end

        if demoting_bootstrap_admin?(user)
          return render json: { errors: [ "This user is a bootstrap admin. Remove their email from CLERK_BOOTSTRAP_ADMIN_EMAILS before changing their role." ] }, status: :unprocessable_entity
        end

        user.save!
        render json: { user: Serializers.user(user) }
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def removing_last_admin?(user)
        user.will_save_change_to_role? && user.role_was == "admin" && user.role != "admin" && User.where(role: "admin").where.not(id: user.id).none?
      end

      def demoting_bootstrap_admin?(user)
        user.will_save_change_to_role? && user.role != "admin" && Auth::RoleResolver.bootstrap_admin?(user.email)
      end
    end
  end
end
