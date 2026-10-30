require "digest"

class WorkOrderCreateReceipt < ApplicationRecord
  UUID_FORMAT = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/.freeze

  belongs_to :user
  belongs_to :work_order, optional: true

  validates :client_request_id, format: { with: UUID_FORMAT }
  validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }

  def self.fingerprint(values)
    Digest::SHA256.hexdigest(canonical(values.to_h).to_json)
  end

  def self.canonical(value)
    case value
    when Hash
      value.transform_keys(&:to_s).sort.to_h.transform_values { |nested| canonical(nested) }
    when Array
      value.map { |nested| canonical(nested) }
    else
      value
    end
  end
  private_class_method :canonical
end
