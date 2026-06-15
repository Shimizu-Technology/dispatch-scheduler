Rails.application.routes.draw do
  get "up", to: proc { [ 200, { "Content-Type" => "application/json" }, [ { ok: true }.to_json ] ] }

  namespace :api do
    namespace :v1 do
      get "me", to: "me#show"
      get "dashboard", to: "dashboard#index"
      get "reports/monthly", to: "reports#monthly"
      resources :users, only: [ :index, :create, :update, :destroy ] do
        member do
          post :resend_invitation
        end
      end
      resources :audit_events, only: [ :index ]
      resources :service_lines, only: [ :index, :create, :update ]
      post "work_order_imports/preview", to: "work_order_imports#preview"
      resources :work_orders, only: [ :index, :create, :update ] do
        member do
          patch :archive
          patch :unarchive
          patch :status, action: :update_status
        end
      end
      resources :technicians, only: [ :index, :create, :update, :destroy ]
      resources :teams, only: [ :index, :create, :update, :destroy ] do
        member do
          patch :daily_memberships
        end
      end
      resources :pm_tasks, only: [ :index, :create, :update ] do
        collection do
          post :bulk_create
        end
      end
      resources :dispatch_items, only: [ :update ] do
        member do
          patch :outcome
        end
      end
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
