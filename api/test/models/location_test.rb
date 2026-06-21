require "test_helper"

class LocationTest < ActiveSupport::TestCase
  test "normalizes explicit or inferred PM regions" do
    assert_equal "Central", Location.normalized_region(" Central ", "Yigo North")
    assert_equal "South", Location.normalized_region(nil, "Agat South")
    assert_equal "Unknown", Location.normalized_region(nil, "Station Pending Region")
  end

  test "region inference ignores the Unknown fallback label" do
    assert_nil Location.inferred_region("Unknown Station")
  end
end
