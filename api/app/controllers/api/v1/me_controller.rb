module Api
  module V1
    class MeController < ApplicationController
      def show
        render json: {
          user: Serializers.user(current_user)
        }
      end
    end
  end
end
