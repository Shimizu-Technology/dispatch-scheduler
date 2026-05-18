export type Dashboard = {
  date: string
  counts: Record<string, number>
  status_breakdown: Record<string, number>
  priority_breakdown: Record<string, number>
}

export type WorkOrder = {
  id: number
  external_id: string | null
  client: string
  location: string
  region: string
  title: string
  description: string
  priority: string
  normalized_priority: string
  status: string
  original_status_text: string
  trade_category: string
  scheduled_date: string | null
  source: string
  team_name: string | null
  notes: string | null
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
  status: string
  original_status_text?: string
  trade_category: string
  scheduled_date?: string
  notes?: string
}

export type Technician = {
  id: number
  name: string
  primary_trade: string
  skills: string[]
  is_driver: boolean
  availability: string
  availability_reason?: string
}

export type Team = {
  id: number
  name: string
  region_preference: string | null
  has_driver: boolean
  skills: string[]
  technicians: Technician[]
}

export type PmTask = {
  id: number
  client: string
  location: string
  region: string
  task_name: string
  trade_category: string
  scheduled_date: string
}

export type DispatchItem = {
  id: number
  team_id: number
  team_name: string
  order_index: number
  scheduled_time: string | null
  notes: string | null
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

export type CurrentUser = {
  id: number | null
  clerk_id: string
  email: string
  name: string
  role: 'admin' | 'dispatcher' | 'viewer'
  auth_mode?: string
  permissions: {
    can_edit_dispatch: boolean
    can_admin: boolean
  }
}

export type ManagedUser = CurrentUser & {
  id: number
  last_seen_at: string | null
}
