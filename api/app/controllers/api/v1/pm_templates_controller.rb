module Api
  module V1
    class PmTemplatesController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :update, :archive, :unarchive, :preview, :generate ]

      def index
        templates = template_scope.order(:name)
        templates = templates.active unless params[:include_inactive].to_s == "true"
        render json: { pm_templates: templates.map { |template| Serializers.pm_template(template) } }
      end

      def create
        template = nil
        ApplicationRecord.transaction do
          template = create_template!
          AuditEvent.record!(action: "pm_template.created", record: template, user: current_user, metadata: pm_template_audit_metadata(template))
        end
        render json: { pm_template: Serializers.pm_template(template_scope.find(template.id)) }, status: :created
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotUnique => e
        render json: { errors: record_not_unique_errors(e) }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def update
        template = template_scope.find(params[:id])
        ApplicationRecord.transaction do
          update_template!(template)
          AuditEvent.record!(action: "pm_template.updated", record: template, user: current_user, metadata: pm_template_audit_metadata(template))
        end
        render json: { pm_template: Serializers.pm_template(template_scope.find(template.id)) }
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotUnique => e
        render json: { errors: record_not_unique_errors(e) }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def archive
        template = PmTemplate.find(params[:id])
        ApplicationRecord.transaction do
          template.update!(active: false)
          AuditEvent.record!(action: "pm_template.archived", record: template, user: current_user, metadata: pm_template_audit_metadata(template))
        end
        render json: { pm_template: Serializers.pm_template(template_scope.find(template.id)) }
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def unarchive
        template = PmTemplate.find(params[:id])
        ApplicationRecord.transaction do
          template.update!(active: true)
          AuditEvent.record!(action: "pm_template.unarchived", record: template, user: current_user, metadata: pm_template_audit_metadata(template))
        end
        render json: { pm_template: Serializers.pm_template(template_scope.find(template.id)) }
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def preview
        render json: generation_service.preview
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def generate
        result = generation_service.generate!
        status = result.dig(:summary, :created_count).to_i.positive? ? :created : :ok
        render json: result, status: status
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      private

      def create_template!
        attrs = template_params
        locations = Array(attrs.delete(:locations))
        items = Array(attrs.delete(:items))
        raise ArgumentError, "Add at least one station to the PM template" if locations.blank?
        raise ArgumentError, "Add at least one PM item to the template" if items.blank?
        raise ArgumentError, "PM template setup is limited to 250 stations" if locations.length > 250
        raise ArgumentError, "PM template setup is limited to 100 PM items" if items.length > 100

        locations = deduplicated_location_params(locations)

        client = Client.find_or_create_by!(name: attrs[:client].to_s.strip.presence || "Mobil")
        template_name = attrs[:name].to_s.strip.presence || "#{client.name} Monthly PMs"
        raise ArgumentError, "PM template name already exists for #{client.name}" if PmTemplate.exists?(client: client, name: template_name)

        service_line = attrs[:service_line_id].present? ? ServiceLine.find(attrs[:service_line_id]) : nil
        template = PmTemplate.create!(
          client: client,
          service_line: service_line,
          name: template_name,
          notes: attrs[:notes].presence
        )

        locations.each_with_index do |location_attrs, index|
          location = build_location!(client, location_attrs)
          template.pm_template_locations.create!(location: location, position: index)
        end

        items.each_with_index do |item_attrs, index|
          item_params = item_attrs.respond_to?(:permit) ? item_attrs.permit(:task_name, :trade_category, :frequency, :estimated_minutes, :notes) : item_attrs
          task_name = item_params[:task_name].to_s.strip.presence || raise(ArgumentError, "PM item task name can't be blank")
          frequency = item_params[:frequency].presence || "monthly"
          raise ArgumentError, "Invalid PM frequency: #{frequency}" unless PmTemplateItem::FREQUENCIES.include?(frequency)

          template.pm_template_items.create!(
            task_name: task_name,
            trade_category: item_params[:trade_category].presence || "General",
            frequency: frequency,
            estimated_minutes: item_params[:estimated_minutes].presence || PmTemplateItem.column_defaults.fetch("estimated_minutes"),
            position: index,
            notes: item_params[:notes].presence
          )
        end

        template
      end

      def update_template!(template)
        attrs = template_params
        locations = attrs.key?(:locations) ? Array(attrs.delete(:locations)) : nil
        items = attrs.key?(:items) ? Array(attrs.delete(:items)) : nil
        raise ArgumentError, "Add at least one station to the PM template" if locations&.blank?
        raise ArgumentError, "Add at least one PM item to the template" if items&.blank?
        raise ArgumentError, "PM template setup is limited to 250 stations" if locations&.length.to_i > 250
        raise ArgumentError, "PM template setup is limited to 100 PM items" if items&.length.to_i > 100

        client = Client.find_or_create_by!(name: attrs[:client].to_s.strip.presence || template.client.name)
        template_name = attrs[:name].to_s.strip.presence || template.name
        if PmTemplate.where(client: client, name: template_name).where.not(id: template.id).exists?
          raise ArgumentError, "PM template name already exists for #{client.name}"
        end

        service_line = attrs.key?(:service_line_id) ? (attrs[:service_line_id].present? ? ServiceLine.find(attrs[:service_line_id]) : nil) : template.service_line
        template.update!(client: client, service_line: service_line, name: template_name, notes: attrs.key?(:notes) ? attrs[:notes].presence : template.notes)
        sync_template_locations!(template, client, deduplicated_location_params(locations)) if locations
        sync_template_items!(template, items) if items
        raise ArgumentError, "Keep at least one active station on the PM template" if template.pm_template_locations.active.none?
        raise ArgumentError, "Keep at least one active PM item on the template" if template.pm_template_items.active.none?

        template
      end

      def sync_template_locations!(template, client, locations)
        active_location_ids = []
        locations.each_with_index do |location_attrs, index|
          location = build_location!(client, location_attrs)
          assignment = template.pm_template_locations.find_or_initialize_by(location: location)
          assignment.update!(position: index, active: true)
          active_location_ids << location.id
        end
        template.pm_template_locations.where.not(location_id: active_location_ids).update_all(active: false, updated_at: Time.current)
      end

      def sync_template_items!(template, items)
        active_item_ids = []
        seen_names = {}
        items.each_with_index do |item_attrs, index|
          item_params = permitted_item_params(item_attrs)
          task_name = item_params[:task_name].to_s.strip.presence || raise(ArgumentError, "PM item task name can't be blank")
          key = task_name.downcase
          raise ArgumentError, "PM template has duplicate checklist item names" if seen_names[key]

          seen_names[key] = true
          frequency = item_params[:frequency].presence || "monthly"
          raise ArgumentError, "Invalid PM frequency: #{frequency}" unless PmTemplateItem::FREQUENCIES.include?(frequency)

          item = item_params[:id].present? ? template.pm_template_items.find_by(id: item_params[:id]) : template.pm_template_items.find_by(task_name: task_name)
          item ||= template.pm_template_items.build
          item.update!(
            task_name: task_name,
            trade_category: item_params[:trade_category].presence || "General",
            frequency: frequency,
            estimated_minutes: item_params[:estimated_minutes].presence || PmTemplateItem.column_defaults.fetch("estimated_minutes"),
            position: index,
            notes: item_params[:notes].presence,
            active: true
          )
          active_item_ids << item.id
        end
        template.pm_template_items.where.not(id: active_item_ids).update_all(active: false, updated_at: Time.current)
      end

      def deduplicated_location_params(locations)
        seen = {}
        locations.filter_map do |attrs|
          location_attrs = attrs.respond_to?(:permit) ? attrs.permit(:id, :name, :region, :active) : attrs
          name = location_attrs[:name].to_s.strip.presence || raise(ArgumentError, "Station name can't be blank")
          key = name.downcase
          next if seen[key]

          seen[key] = true
          location_attrs
        end
      end

      def build_location!(client, attrs)
        location_attrs = attrs.respond_to?(:permit) ? attrs.permit(:name, :region) : attrs
        name = location_attrs[:name].to_s.strip.presence || raise(ArgumentError, "Station name can't be blank")
        location = Location.find_or_initialize_by_normalized_name(client: client, name: name)
        region = Location.normalized_region(location_attrs[:region], name)
        location.name = name
        location.region = region if location.new_record? || location.region.blank? || location.region == Location::UNKNOWN_REGION
        location.save!
        location
      end

      def template_params
        params.permit(
          :name,
          :client,
          :service_line_id,
          :notes,
          locations: [ :id, :name, :region, :active ],
          items: [ :id, :task_name, :trade_category, :frequency, :estimated_minutes, :notes, :active ]
        )
      end

      def permitted_item_params(item_attrs)
        item_attrs.respond_to?(:permit) ? item_attrs.permit(:id, :task_name, :trade_category, :frequency, :estimated_minutes, :notes, :active) : item_attrs
      end

      def generation_service
        template = template_scope.find(params[:id])
        raise ArgumentError, "PM template is inactive" unless template.active?

        PmTemplateGenerationService.new(
          template: template,
          month: params[:month],
          frequency_filters: params[:frequencies] || params[:frequency_filters],
          location_ids: params[:location_ids],
          item_ids: params[:item_ids],
          due_on: params[:due_on],
          user: current_user
        )
      end

      def template_scope
        PmTemplate.includes(:client, :service_line, pm_template_locations: :location, pm_template_items: { pm_template_item_locations: :location })
      end

      def record_not_unique_errors(error)
        message = error.message.to_s
        return [ "PM template name already exists for this client" ] if message.include?("index_pm_templates_on_client_id_and_name") || message.include?("pm_templates.client_id")
        return [ "PM template has duplicate checklist item names" ] if message.include?("index_pm_template_items_on_pm_template_id_and_task_name") || message.include?("pm_template_items.pm_template_id")
        return [ "PM template has duplicate station rows" ] if message.include?("index_pm_template_locations_on_pm_template_id_and_location_id") || message.include?("pm_template_locations.pm_template_id")
        return [ "PM checklist item has duplicate station restrictions" ] if message.include?("index_pm_template_item_locations_unique") || message.include?("pm_template_item_locations.pm_template_item_id")

        [ "PM template has duplicate station or checklist rows" ]
      end

      def pm_template_audit_metadata(template)
        {
          name: template.name,
          client: template.client.name,
          service_line: template.service_line&.name,
          station_count: template.pm_template_locations.active.count,
          item_count: template.pm_template_items.active.count
        }
      end
    end
  end
end
