module Api
  module V1
    class MeController < ApplicationController
      def show
        render json: {
          user: {
            id: current_user.id,
            clerk_id: current_user.clerk_id,
            email: current_user.email,
            name: current_user.display_name,
            role: current_user.role,
            auth_mode: current_user.auth_mode,
            permissions: {
              can_edit_dispatch: current_user.can_edit_dispatch?,
              can_admin: current_user.admin?
            }
          }
        }
      end
    end
  end
end
