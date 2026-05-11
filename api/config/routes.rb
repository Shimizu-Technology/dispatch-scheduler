Rails.application.routes.draw do
  match "*path", to: proc { [ 204, { "Access-Control-Allow-Origin" => "*", "Access-Control-Allow-Methods" => "GET, POST, PATCH, OPTIONS", "Access-Control-Allow-Headers" => "Content-Type, Authorization" }, [] ] }, via: :options

  namespace :api do
    namespace :v1 do
      get "dashboard", to: "dashboard#index"
      resources :work_orders, only: [ :index, :create ]
      resources :technicians, only: [ :index, :update ]
      resources :teams, only: [ :index ]
      resources :pm_tasks, only: [ :index ]
      resources :dispatch_items, only: [ :update ]
      resources :dispatch_schedules, only: [ :show ] do
        collection do
          post :suggest
        end
        member do
          get :whatsapp_export
        end
      end
    end
  end
end
