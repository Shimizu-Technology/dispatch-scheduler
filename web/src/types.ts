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
  sla_due_at: string | null
  sla_status: 'missing' | 'overdue' | 'due_soon' | 'on_track'
  scheduled_date: string | null
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
  last_dispatched_on?: string | null
  last_crew_name?: string | null
  last_outcome_status?: DispatchOutcomeStatus | null
}

export type OcrWorkOrderDraft = WorkOrderInput & {
  confidence: 'high' | 'medium' | 'low'
  issues: string[]
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
  notes?: string
  service_line_id?: number | string | null
  service_line?: string
  pa_project?: boolean
  pa_project_notes?: string
  corrective_maintenance?: boolean
  estimate_required?: boolean
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
  scheduled_date: string
  status: PmTaskStatus
  completed_at: string | null
  deferred_until: string | null
  notes: string | null
}

export type DispatchOutcomeStatus = 'pending' | 'completed' | 'carry_over' | 'waiting_parts' | 'waiting_approval' | 'unable_to_access' | 'cancelled'

export type DispatchItem = {
  id: number
  team_id: number
  team_name: string
  crew_name: string
  technician_names: string[]
  call_out_names: string[]
  order_index: number
  scheduled_time: string | null
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
