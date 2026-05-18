Rails.application.routes.draw do
  get "up", to: proc { [ 200, { "Content-Type" => "application/json" }, [ { ok: true }.to_json ] ] }

  namespace :api do
    namespace :v1 do
      get "me", to: "me#show"
      get "dashboard", to: "dashboard#index"
      resources :users, only: [ :index, :update ]
      resources :audit_events, only: [ :index ]
      resources :work_orders, only: [ :index, :create, :update ]
      resources :technicians, only: [ :index, :update ]
      resources :teams, only: [ :index ] do
        member do
          patch :daily_memberships
        end
      end
      resources :pm_tasks, only: [ :index ]
      resources :dispatch_items, only: [ :update ]
      resources :dispatch_schedules, only: [ :index, :show ] do
        collection do
          post :suggest
        end
        member do
          get :whatsapp_export
          post :finalize
          post :mark_sent
          post :reopen
        end
      end
    end
  end
end
