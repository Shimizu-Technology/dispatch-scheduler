class AuditEvent < ApplicationRecord
  belongs_to :user, optional: true

  validates :action, :record_type, :occurred_at, presence: true

  before_validation :set_occurred_at

  class << self
    def record!(action:, record:, user:, metadata: {})
      create!(
        action: action,
        record_type: record.class.name,
        record_id: record.id,
        user: user,
        metadata: metadata.to_json
      )
    end
  end

  def metadata_hash
    JSON.parse(metadata.presence || "{}")
  rescue JSON::ParserError
    {}
  end

  private

  def set_occurred_at
    self.occurred_at ||= Time.current
  end
end
