export type Dashboard = {
  date: string
  counts: Record<string, number>
  status_breakdown: Record<string, number>
  priority_breakdown: Record<string, number>
}

export type WorkOrderStatus = 'new' | 'needs_assessment' | 'approved' | 'scheduled' | 'in_progress' | 'carry_over' | 'waiting_for_parts' | 'waiting_for_approval' | 'completed' | 'closed' | 'cancelled'

export type WorkOrder = {
  id: number
  external_id: string | null
  client: string
  location: string
  region: string
  title: string
  description: string
  created_at: string
  priority: string
  normalized_priority: string
  status: WorkOrderStatus
  original_status_text: string
  trade_category: string
  requested_at: string | null
  reported_at: string | null
  assessment_due_at: string | null
  response_due_at: string | null
  repair_due_at: string | null
  assessed_at: string | null
  closed_at: string | null
  sla_due_at: string | null
  sla_status: 'missing' | 'overdue' | 'due_soon' | 'on_track'
  scheduled_date: string | null
  estimated_hours: number | null
  required_technician_count: number
  source: string
  archived: boolean
  archived_at: string | null
  team_name: string | null
  notes: string | null
  service_line_id: number | null
  service_line: string | null
  pa_project: boolean
  pa_project_notes: string | null
  corrective_maintenance: boolean
  estimate_required: boolean
  estimate_number: string | null
  parts_status: string | null
  parts_ordered: boolean
  parts_ordered_at: string | null
  parts_eta: string | null
  follow_up_due_on: string | null
  follow_up_owner: string | null
  vendor_reference: string | null
  latest_follow_up_note: string | null
  last_dispatched_on?: string | null
  last_crew_name?: string | null
  last_outcome_status?: DispatchOutcomeStatus | null
}

export type OcrWorkOrderDraft = WorkOrderInput & {
  confidence: 'high' | 'medium' | 'low'
  issues: string[]
  import_id: number
  import_item_id: number
  import_status: 'pending' | 'approved' | 'rejected'
  source_kind: 'file' | 'pasted_text'
  source_filename?: string | null
  imported_at: string
}

export type WorkOrderImportPreview = {
  work_orders: OcrWorkOrderDraft[]
}

export type WorkOrderInput = {
  client: string
  location: string
  region: string
  external_id?: string
  source: string
  source_reference?: string
  title?: string
  description: string
  priority: string
  normalized_priority?: string
  status: WorkOrderStatus
  original_status_text?: string
  trade_category: string
  requested_at?: string
  reported_at?: string
  assessment_due_at?: string
  response_due_at?: string
  repair_due_at?: string
  assessed_at?: string
  scheduled_date?: string
  estimated_hours?: number | string | null
  required_technician_count?: number | string | null
  notes?: string
  service_line_id?: number | string | null
  service_line?: string
  pa_project?: boolean
  pa_project_notes?: string
  corrective_maintenance?: boolean
  estimate_required?: boolean
  estimate_number?: string
  parts_status?: string
  parts_ordered?: boolean
  parts_ordered_at?: string
  parts_eta?: string
  follow_up_due_on?: string
  follow_up_owner?: string
  vendor_reference?: string
  latest_follow_up_note?: string
  work_order_import_item_id?: number
}

export type MonthlyReport = {
  month: string
  generated_at: string
  as_of: string
  period: { starts_on: string; ends_on: string }
  work_orders: {
    total: number
    reported: number
    active_during_month: number
    open: number
    open_as_of: number
    completed_or_closed: number
    closed_during_month: number
    corrective_maintenance: number
    estimate_required: number
    pa_projects: number
    waiting_for_parts: number
    waiting_for_approval: number
    kpi_overdue: number
    kpi_due_soon: number
    kpi_missing: number
    by_status: Record<string, number>
    by_priority: Record<string, number>
    by_service_line: Record<string, number>
  }
  pm_tasks: {
    total: number
    completed: number
    incomplete: number
    deferred: number
    timed?: number
    timed_visits?: number
    actual_minutes?: number
    by_status: Record<string, number>
    by_region: Record<string, number>
    by_trade_actual_minutes?: Record<string, number>
  }
  follow_ups: {
    due_today: number
    due_by_as_of: number
    due_this_month: number
    parts_eta_this_month: number
    pa_projects_due_this_month: number
  }
}

export type ServiceLine = {
  id: number
  name: string
  position: number
  active: boolean
  notes: string | null
  work_orders_count: number
}

export type ServiceLineInput = {
  name: string
  position?: number
  active?: boolean
  notes?: string
}

export type Technician = {
  id: number
  name: string
  primary_trade: string
  skills: string[]
  is_driver: boolean
  active: boolean
  notes?: string | null
  availability: string
  availability_reason?: string
}

export type TechnicianInput = {
  name: string
  primary_trade: string
  skills: string[]
  is_driver: boolean
  active?: boolean
  notes?: string
}

export type Team = {
  id: number
  name: string
  today_crew_name: string
  region_preference: string | null
  crew_type: string
  active: boolean
  archived: boolean
  archived_at?: string | null
  service_line_ids: number[]
  service_line_names: string[]
  has_driver: boolean
  default_has_driver: boolean
  skills: string[]
  default_skills: string[]
  daily_override: boolean
  technicians: Technician[]
  default_technicians: Technician[]
}

export type TeamInput = {
  name?: string
  region_preference?: string
  crew_type?: string
  technician_ids: number[]
  service_line_ids?: number[]
}

export type PaginationMeta = {
  page: number
  per_page: number
  total_count: number
  total_pages: number
  sort: string
  direction: 'ASC' | 'DESC'
  sub_counts?: Record<string, number>
}

export type WorkOrderListPayload = {
  work_orders: WorkOrder[]
  meta: PaginationMeta
}

export type PmTaskStatus = 'pending' | 'scheduled' | 'completed' | 'deferred'

export type PmTask = {
  id: number
  client: string
  location: string
  region: string
  task_name: string
  trade_category: string
  frequency?: string
  scheduled_date: string
  due_on?: string | null
  period_start?: string | null
  period_end?: string | null
  estimated_minutes?: number | null
  pm_template_id?: number | null
  pm_template_item_id?: number | null
  pm_template_name?: string | null
  status: PmTaskStatus
  completed_at: string | null
  time_in_at?: string | null
  time_out_at?: string | null
  actual_duration_minutes?: number | null
  deferred_until: string | null
  notes: string | null
  archived?: boolean
  archived_at?: string | null
  archive_reason?: string | null
}

export type PmTaskInput = {
  client: string
  location: string
  region: string
  task_name: string
  trade_category: string
  frequency?: string
  scheduled_date: string
  due_on?: string
  estimated_minutes?: number | string | null
  time_in_at?: string
  time_out_at?: string
  notes?: string
}

export type PmFrequency = 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'manual'

export type PmTemplateLocation = {
  id: number
  name: string
  region: string
  position: number
  active: boolean
}

export type PmTemplateItem = {
  id: number
  task_name: string
  trade_category: string
  frequency: PmFrequency
  estimated_minutes: number
  position: number
  active: boolean
  notes: string | null
  location_ids: number[]
}

export type PmTemplate = {
  id: number
  name: string
  client_id: number
  client: string
  service_line_id: number | null
  service_line: string | null
  active: boolean
  notes: string | null
  locations: PmTemplateLocation[]
  items: PmTemplateItem[]
}

export type PmTemplateInput = {
  name: string
  client: string
  service_line_id?: number | string | null
  notes?: string
  locations: Array<{ id?: number; name: string; region: string; active?: boolean }>
  items: Array<{ id?: number; task_name: string; trade_category: string; frequency: PmFrequency; estimated_minutes?: number | string | null; notes?: string; active?: boolean }>
}

export type PmTemplatePreviewRow = {
  location_id: number
  location: string
  region: string
  item_id: number
  task_name: string
  trade_category: string
  frequency: PmFrequency
  estimated_minutes: number
  due_on: string
  duplicate: boolean
  status: 'new' | 'duplicate'
}

export type PmTemplateGenerationPayload = {
  template: PmTemplate
  month: string
  period: { starts_on: string; ends_on: string; due_on: string }
  summary: { candidate_count: number; new_count?: number; created_count?: number; duplicate_count: number; station_count: number; item_count: number; frequencies?: string[] }
  rows?: PmTemplatePreviewRow[]
  created?: PmTask[]
  duplicates?: Array<{ index: number; client: string; location: string; task_name: string; scheduled_date: string }>
}

export type PmTaskBulkCreatePayload = {
  created: PmTask[]
  duplicates: Array<{ index: number; client: string; location: string; task_name: string; scheduled_date: string }>
  summary: { created_count: number; duplicate_count: number }
}

export type DispatchOutcomeStatus = 'pending' | 'completed' | 'carry_over' | 'waiting_parts' | 'waiting_approval' | 'unable_to_access' | 'cancelled'

export type DispatchItemTechnician = {
  technician_id: number
  name: string
  primary_trade: string | null
  is_driver: boolean
  position: number | null
}

export type DispatchItem = {
  id: number
  team_id: number
  team_name: string
  crew_name: string
  technician_names: string[]
  assigned_technicians: DispatchItemTechnician[]
  call_out_names: string[]
  order_index: number
  scheduled_time: string | null
  capacity_overflow: boolean
  notes: string | null
  outcome_status: DispatchOutcomeStatus
  outcome_notes: string | null
  completed_at: string | null
  carried_over_to_date: string | null
  reassignment_reason: string | null
  kind: 'work_order' | 'pm_task'
  work_order?: WorkOrder
  pm_task?: PmTask
}

export type DispatchSummary = {
  scheduled_items: number
  eligible_work_orders: number
  eligible_pm_tasks: number
  deferred_items: number
  daily_item_limit: number | null
  blocked_work_orders: number
  unfinished_previous_items: number
  capacity_deferred_items: number
  over_capacity_items: number
  message: string
}

export type WhatsAppCrewExport = {
  team_id: number
  team_name: string
  active_team_name: string
  technician_names: string[]
  driver_names: string[]
  call_outs: Array<{ name: string; reason: string }>
  stops_count: number
}

export type WhatsAppExportPayload = {
  id: number
  date: string
  status: 'draft' | 'finalized' | 'sent'
  message: string
  crews: WhatsAppCrewExport[]
}

export type DispatchSchedule = {
  id: number
  date: string
  status: 'draft' | 'finalized' | 'sent'
  finalized_at: string | null
  sent_at: string | null
  finalized_by: string | null
  sent_by: string | null
  summary: DispatchSummary
  items: DispatchItem[]
}

export type UserRole = 'admin' | 'dispatcher' | 'viewer'

export type CurrentUser = {
  id: number | null
  clerk_id: string
  email: string
  name: string
  role: UserRole
  auth_mode?: string
  active?: boolean
  invitation_status?: 'pending' | 'accepted'
  invitation_pending?: boolean
  invited_at?: string | null
  invitation_accepted_at?: string | null
  permissions: {
    can_edit_dispatch: boolean
    can_admin: boolean
  }
}

export type ManagedUser = CurrentUser & {
  id: number
  last_seen_at: string | null
  active: boolean
  invitation_status: 'pending' | 'accepted'
  invitation_pending: boolean
  invited_at: string | null
  invitation_accepted_at: string | null
}

export type AuditEvent = {
  id: number
  action: string
  record_type: string
  record_id: number | null
  user_name: string | null
  occurred_at: string | null
  metadata: Record<string, string | number | boolean | null | string[] | number[]>
}
