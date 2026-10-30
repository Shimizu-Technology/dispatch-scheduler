require "digest"

# Covers the first numbered intake as well as later creates/identity changes.
# It does not require changing or imposing a unique index on legacy work orders.
class WorkOrderIdentityLock < ApplicationRecord
  def self.normalized_pair(source, number)
    [ source.to_s.strip.downcase.presence || "manual", number.to_s.strip.downcase.presence ]
  end

  def self.synchronize(source, number)
    pair = normalized_pair(source, number)
    return yield if pair.last.nil?

    digest = Digest::SHA256.hexdigest(pair.to_json)
    record = create_or_find_by!(identity_digest: digest)
    record.with_lock { yield }
  end

  def self.normalized_node(column)
    whitespace = Arel::Nodes.build_quoted(" \t\n\r\f\v")
    right_trimmed = Arel::Nodes::NamedFunction.new("RTRIM", [ column, whitespace ])
    trimmed = Arel::Nodes::NamedFunction.new("LTRIM", [ right_trimmed, whitespace ])
    Arel::Nodes::NamedFunction.new("LOWER", [ trimmed ])
  end
end
