class ApplicationController < ActionController::API
  before_action :set_cors_headers

  private

  def set_cors_headers
    response.set_header("Access-Control-Allow-Origin", "*")
    response.set_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
    response.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
  end
end
