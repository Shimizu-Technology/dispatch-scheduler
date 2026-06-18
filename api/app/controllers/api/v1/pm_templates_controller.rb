module Api
  module V1
    class PmTemplatesController < ApplicationController
      before_action :require_dispatch_edit!, only: [ :create, :preview, :generate ]

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
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def preview
        render json: generation_service.preview
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ArgumentError => e
        render json: { errors: [ e.message ] }, status: :unprocessable_entity
      end

      def generate
        render json: generation_service.generate!, status: :created
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

        client = Client.find_or_create_by!(name: attrs[:client].to_s.strip.presence || "Mobil")
        service_line = attrs[:service_line_id].present? ? ServiceLine.find(attrs[:service_line_id]) : nil
        template = PmTemplate.create!(
          client: client,
          service_line: service_line,
          name: attrs[:name].to_s.strip.presence || "#{client.name} Monthly PMs",
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

      def build_location!(client, attrs)
        location_attrs = attrs.respond_to?(:permit) ? attrs.permit(:name, :region) : attrs
        name = location_attrs[:name].to_s.strip.presence || raise(ArgumentError, "Station name can't be blank")
        location = Location.find_or_initialize_by_normalized_name(client: client, name: name)
        location.name = name
        location.region = location_attrs[:region].to_s.strip.presence || location.region.presence || "Unknown"
        location.save!
        location
      end

      def template_params
        params.permit(
          :name,
          :client,
          :service_line_id,
          :notes,
          locations: [ :name, :region ],
          items: [ :task_name, :trade_category, :frequency, :estimated_minutes, :notes ]
        )
      end

      def generation_service
        template = template_scope.find(params[:id])
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

      def pm_template_audit_metadata(template)
        {
          name: template.name,
          client: template.client.name,
          service_line: template.service_line&.name,
          station_count: template.pm_template_locations.count,
          item_count: template.pm_template_items.count
        }
      end
    end
  end
end
