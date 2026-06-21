class Location < ApplicationRecord
  UNKNOWN_REGION = "Unknown".freeze
  REGION_NAMES = [ "North", "Central", "South", "Islandwide" ].freeze

  belongs_to :client
  has_many :work_orders, dependent: :destroy
  has_many :pm_tasks, dependent: :destroy

  before_validation :normalize_text_fields

  def self.find_or_initialize_by_normalized_name(client:, name:)
    normalized_name = name.to_s.strip
    where(client: client)
      .where("LOWER(TRIM(name)) = ?", normalized_name.downcase)
      .order(:id)
      .first || new(client: client, name: normalized_name)
  end

  def self.normalized_region(value, location_name = nil)
    value.to_s.strip.presence || inferred_region(location_name) || UNKNOWN_REGION
  end

  def self.inferred_region(location_name)
    REGION_NAMES.find { |region| location_name.to_s.match?(/\b#{Regexp.escape(region)}\b/i) }
  end

  private

  def normalize_text_fields
    self.name = name.to_s.strip if name.present?
    self.region = region.to_s.strip if region.present?
  end
end
