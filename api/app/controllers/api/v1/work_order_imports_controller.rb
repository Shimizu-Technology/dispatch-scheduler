require "digest"

module Api
  module V1
    class WorkOrderImportsController < ApplicationController
      before_action :require_dispatch_edit!

      def index
        imports = WorkOrderImport.owned_by(current_user)
          .with_pending_items
          .includes(:items)
          .order(created_at: :desc)
          .limit(50)
        items = imports.flat_map { |work_order_import| work_order_import.items.select { |item| item.status == "pending" } }
        render json: { work_orders: items.map { |item| Serializers.work_order_import_item(item) } }
      end

      def preview
        if params[:file].present? && params[:text].present?
          return render json: { errors: [ "Choose either one file or pasted text for each intake." ] }, status: :unprocessable_entity
        end

        result = WorkOrderOcrExtractor.extract(params[:file], text: params[:text])
        if result[:success] && result[:work_orders].present?
          work_order_import = persist_import!(result)
          render json: { work_orders: work_order_import.items.order(:position).map { |item| Serializers.work_order_import_item(item) } }
        elsif result[:success]
          render json: { errors: [ "No readable work-order requests were found in that source." ] }, status: :unprocessable_entity
        else
          render json: { errors: [ result[:error] ] }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def reject_item
        ApplicationRecord.transaction do
          item = WorkOrderImportItem.owned_by(current_user).pending_review.lock.find(params[:id])
          item.reject!(user: current_user)
          AuditEvent.record!(
            action: "work_order_import.rejected",
            record: item.work_order_import,
            user: current_user,
            metadata: { import_item_id: item.id, source_filename: item.work_order_import.source_filename, position: item.position }
          )
        end
        head :no_content
      rescue ActiveRecord::RecordNotFound => e
        render json: { errors: [ e.message ] }, status: :not_found
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def persist_import!(result)
        upload = params[:file]
        source_kind = upload.present? ? "file" : "pasted_text"
        work_order_import = nil

        ApplicationRecord.transaction do
          work_order_import = WorkOrderImport.create!(
            user: current_user,
            source_kind: source_kind,
            source_filename: upload&.original_filename,
            source_content_type: upload&.content_type,
            source_sha256: upload.present? ? upload_sha256(upload) : Digest::SHA256.hexdigest(params[:text].to_s),
            source_text: source_kind == "pasted_text" ? params[:text].to_s : nil,
            raw_response: result[:raw_response],
            extraction_model: ENV.fetch("OPENROUTER_WORK_ORDER_OCR_MODEL", WorkOrderOcrExtractor::DEFAULT_MODEL),
            status: "pending",
            extracted_at: Time.current
          )
          result[:work_orders].each_with_index do |row, position|
            work_order_import.items.create!(position: position, extracted_data: row)
          end
          attach_source_file!(work_order_import, upload) if upload.present?
          AuditEvent.record!(
            action: "work_order_import.previewed",
            record: work_order_import,
            user: current_user,
            metadata: {
              source_kind: source_kind,
              source_filename: work_order_import.source_filename,
              extracted_items: work_order_import.items.size,
              source_sha256: work_order_import.source_sha256
            }
          )
        end

        work_order_import
      end

      def upload_sha256(upload)
        upload.rewind if upload.respond_to?(:rewind)
        digest = Digest::SHA256.hexdigest(upload.read)
        upload.rewind if upload.respond_to?(:rewind)
        digest
      end

      def attach_source_file!(work_order_import, upload)
        upload.rewind if upload.respond_to?(:rewind)
        work_order_import.source_file.attach(
          io: upload,
          filename: upload.original_filename,
          content_type: upload.content_type,
          identify: false
        )
      end
    end
  end
end
