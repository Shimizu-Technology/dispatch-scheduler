module Api
  module V1
    class UsersController < ApplicationController
      before_action :require_admin!

      def index
        render json: { users: User.order(:email).map { |user| Serializers.user(user) } }
      end

      def update
        user = User.find(params[:id])
        user.role = params[:role]

        if removing_last_admin?(user)
          return render json: { errors: [ "At least one admin is required" ] }, status: :unprocessable_entity
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
    end
  end
end
