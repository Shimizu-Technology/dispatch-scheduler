class ApplicationController < ActionController::API
  before_action :authenticate_request!
  rescue_from ActionController::BadRequest, with: :render_bad_request

  attr_reader :current_user

  private

  def authenticate_request!
    unless Auth::ClerkTokenVerifier.enabled?
      render json: { errors: [ "Clerk authentication is not configured" ] }, status: :service_unavailable
      return
    end

    authenticate_with_clerk!
  end

  def authenticate_with_clerk!
    token = bearer_token
    return render json: { errors: [ "Missing bearer token" ] }, status: :unauthorized if token.blank?

    payload = Auth::ClerkTokenVerifier.verify(token)
    return render json: { errors: [ "Invalid bearer token" ] }, status: :unauthorized if payload.blank?

    @current_user = Auth::UserSync.call(payload)
    Current.user = @current_user
  rescue Auth::UserSync::AccessDenied => e
    render json: { errors: [ e.message ] }, status: :forbidden
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
  rescue ActiveRecord::RecordNotUnique, ActiveRecord::StatementInvalid
    render json: { errors: [ "Unable to sync authenticated user. Please retry." ] }, status: :conflict
  end

  def require_dispatch_edit!
    return if current_user&.can_edit_dispatch?

    render json: { errors: [ "Viewer access cannot modify dispatch data" ] }, status: :forbidden
  end

  def require_admin!
    return if current_user&.admin?

    render json: { errors: [ "Admin access required" ] }, status: :forbidden
  end

  def date_param(default: Date.current)
    Date.parse(params[:date].presence || default.to_s)
  rescue Date::Error
    raise ActionController::BadRequest, "Invalid date"
  end

  def bearer_token
    header = request.authorization.to_s
    header[/\ABearer\s+(.+)\z/i, 1]
  end

  def render_bad_request(error)
    render json: { errors: [ error.message ] }, status: :bad_request
  end
end
