require "cgi"
require "json"
require "net/http"
require "openssl"

class UserInviteEmailService
  BRAND_NAME = "JMI Dispatch".freeze
  DEFAULT_TIMEOUT_SECONDS = 5

  class << self
    def send_invite(user:, invited_by:, invitation_url: nil)
      return { sent: false, error: "RESEND_API_KEY is not configured" } if resend_api_key.blank?
      return { sent: false, error: "RESEND_FROM_EMAIL is not configured" } if from_email.blank?

      response = post_resend(
        from: from_email,
        to: user.email,
        subject: "You're invited to #{BRAND_NAME}",
        html: invite_html(user: user, invited_by: invited_by, invite_url: invitation_url.presence || frontend_url)
      )

      if response.is_a?(Net::HTTPSuccess)
        { sent: true }
      else
        { sent: false, error: resend_error(response) }
      end
    rescue JSON::ParserError, SystemCallError, Timeout::Error, SocketError, OpenSSL::SSL::SSLError => e
      Rails.logger.warn("Invite email failed for #{user.email}: #{e.class} #{e.message}")
      { sent: false, error: "Could not send invite email: #{e.message}" }
    end

    private

    def post_resend(payload)
      uri = URI("https://api.resend.com/emails")
      Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: timeout_seconds, read_timeout: timeout_seconds) do |http|
        request = Net::HTTP::Post.new(uri)
        request["Authorization"] = "Bearer #{resend_api_key}"
        request["Content-Type"] = "application/json"
        request.body = payload.to_json
        http.request(request)
      end
    end

    def resend_error(response)
      payload = JSON.parse(response.body) rescue {}
      payload["message"].presence || payload["error"].presence || "Resend API error #{response.code}"
    end

    def resend_api_key
      ENV["RESEND_API_KEY"].to_s.strip
    end

    def from_email
      ENV["RESEND_FROM_EMAIL"].presence || ENV["MAILER_FROM_EMAIL"].presence
    end

    def frontend_url
      ENV.fetch("FRONTEND_URL") { "http://localhost:5173" }
    end

    def timeout_seconds
      Integer(ENV.fetch("RESEND_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
    rescue ArgumentError
      DEFAULT_TIMEOUT_SECONDS
    end

    def h(value)
      CGI.escapeHTML(value.to_s)
    end

    def invite_html(user:, invited_by:, invite_url:)
      inviter = h(invited_by&.display_name.presence || invited_by&.email.presence || "A JMI dispatch admin")
      role = h(user.role.to_s.tr("_", " ").titleize)
      escaped_url = h(invite_url)

      <<~HTML
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>#{h(BRAND_NAME)} invitation</title>
          </head>
          <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:36px 16px;">
              <tr><td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8e0ef;border-radius:18px;overflow:hidden;">
                  <tr><td style="height:6px;background:#d84332;font-size:0;line-height:0;">&nbsp;</td></tr>
                  <tr><td style="padding:32px;">
                    <p style="margin:0 0 10px;color:#244393;font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">JMI Guam Operations</p>
                    <h1 style="margin:0;color:#172033;font-size:26px;line-height:1.25;font-weight:800;">You've been invited to #{h(BRAND_NAME)}</h1>
                    <p style="margin:18px 0 0;color:#526071;font-size:15px;line-height:1.7;">#{inviter} added you as <strong style="color:#172033;">#{role}</strong>. Use the invited email address <strong style="color:#172033;">#{h(user.email)}</strong> when signing in.</p>
                    <div style="margin:24px 0;padding:18px;border-radius:14px;background:#e8eefc;border:1px solid #c9d6f5;color:#172b63;font-size:14px;line-height:1.6;">If this is your first time, choose sign up in Clerk. After sign-in, your JMI dispatch role is applied automatically.</div>
                    <p style="margin:0 0 26px;"><a href="#{escaped_url}" style="display:inline-block;background:#244393;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 24px;font-weight:800;">Accept invitation</a></p>
                    <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;word-break:break-all;">Button not working? Open this link:<br><a href="#{escaped_url}" style="color:#244393;">#{escaped_url}</a></p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body>
        </html>
      HTML
    end
  end
end
