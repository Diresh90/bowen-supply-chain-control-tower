export type Supplier = {
  id: string;
  name: string;
  country: string | null;
  contact_name: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierProductionSetting = {
  supplier_id: string;
  default_monthly_capacity: number;
  created_at: string;
  updated_at: string;
};

export type SupplierCapacityOverride = {
  id: string;
  supplier_id: string;
  capacity_month: string;
  container_capacity: number;
  created_at: string;
  updated_at: string;
};

export const procurementStatuses = [
  "Awaiting Confirmation",
  "Confirmed",
  "In Production",
  "Production Completed",
  "Fully Dispatched",
] as const;

export type ProcurementStatus = (typeof procurementStatuses)[number];

export type ProcurementJob = {
  id: string;
  client_name: string;
  sales_order_number: string | null;
  supplier_po_number: string | null;
  supplier_id: string | null;
  project_manager: string | null;
  required_onsite_date: string | null;
  total_containers: number | null;
  status: ProcurementStatus | null;
  created_at: string;
  updated_at: string;
  suppliers: Pick<Supplier, "id" | "name" | "active"> | null;
};

export const productionPriorities = ["Critical", "High", "Normal", "Low"] as const;
export type ProductionPriority = (typeof productionPriorities)[number];

export type ProductionStage = {
  id: string;
  procurement_job_id: string;
  supplier_id: string;
  stage_reference: string;
  container_quantity: number;
  priority: ProductionPriority;
  queue_sequence: number;
  destination: string | null;
  production_start: string;
  production_duration_weeks: number;
  production_finish: string;
  goods_ready_date: string;
  dispatch_duration_weeks: number;
  planned_etd: string;
  transit_duration_weeks: number;
  port_eta: string;
  destination_duration_weeks: number;
  forecast_site_eta: string;
  required_site_date: string;
  timing_status: string;
  allocation_override: boolean;
  created_at: string;
  updated_at: string;
  procurement_jobs: ProcurementJob;
  suppliers: Pick<Supplier, "id" | "name" | "active">;
};
