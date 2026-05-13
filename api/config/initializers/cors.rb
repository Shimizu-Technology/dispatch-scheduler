frontend_url = ENV["FRONTEND_URL"].presence
extra_origins = ENV.fetch("CORS_ORIGINS", "").split(",").map(&:strip).reject(&:blank?)

if frontend_url.blank? && extra_origins.empty? && !(Rails.env.development? || Rails.env.test?)
  raise "FRONTEND_URL must be set in non-development environments"
end

allowed_origins = [ frontend_url, *extra_origins ].compact

if Rails.env.development? || Rails.env.test?
  allowed_origins += [
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]
end

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*allowed_origins.uniq)

    resource "*",
      headers: :any,
      methods: [ :get, :post, :put, :patch, :delete, :options, :head ]
  end
end
