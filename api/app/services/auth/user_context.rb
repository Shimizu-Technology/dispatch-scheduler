module Auth
  UserContext = Struct.new(:id, :clerk_id, :email, :name, :role, :auth_mode, keyword_init: true) do
    def admin?
      role == "admin"
    end

    def dispatcher?
      role == "dispatcher"
    end

    def viewer?
      role == "viewer"
    end

    def can_edit_dispatch?
      admin? || dispatcher?
    end

    def display_name
      name.presence || email.to_s.split("@").first
    end

    def persisted?
      id.present?
    end
  end
end
