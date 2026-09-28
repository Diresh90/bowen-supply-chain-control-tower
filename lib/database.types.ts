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

// Kept in one place so this can be replaced by Project Manager master data later.
export const projectManagers = [
  "Estee Evens",
  "Mo Talib",
  "Lucky T",
  "Calvin Jackson",
  "Nick W",
  "Cameron W",
  "Diresh D",
] as const;

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

export const freightStatuses = ["Not Planned", "Pending Booking", "Booking Confirmation", "Dispatched", "In Transit", "Completed"] as const;
export const freightRisks = ["On Track", "Off Track"] as const;
export type FreightStatus = (typeof freightStatuses)[number];
export type FreightRisk = (typeof freightRisks)[number];

export type FreightForwarder = { id: string; name: string; active: boolean; created_at: string; updated_at: string };
export type FreightLocation = { id: string; name: string; country: string; location_type: "Seaport" | "Inland Terminal" | "Other"; usage: "Origin" | "Destination" | "Both"; active: boolean; created_at: string; updated_at: string };
export type FreightReference = { id: string; procurement_job_id: string; production_stage_id: string; reference: string; created_at: string; updated_at: string };
export type FreightBooking = {
  id: string; procurement_job_id: string; production_stage_id: string; freight_reference_id: string; supplier_id: string;
  shipment_reference: string; freight_po_number: string | null; container_quantity: number; special_request: string | null;
  origin_location_id: string | null; destination_location_id: string | null; freight_forwarder_id: string | null;
  sea_freight_rate_aud: number; local_charges_aud: number; total_freight_cost_aud: number; total_cost_override: boolean;
  planned_etd: string | null; planned_eta: string | null; status: FreightStatus; risk: FreightRisk; comments: string | null;
  allocation_override: boolean; archived_at: string | null; created_at: string; updated_at: string;
  procurement_jobs: ProcurementJob; production_stages: ProductionStage; suppliers: Pick<Supplier, "id" | "name" | "active">;
  freight_references: FreightReference; freight_forwarders: FreightForwarder | null;
  origin: FreightLocation | null; destination: FreightLocation | null;
};

export type FreightRate = {
  id: string;
  rate_month: string;
  origin_location_id: string | null;
  origin_code: string;
  destination_location_id: string | null;
  container_type: string | null;
  sea_freight_rate_original: number;
  original_currency: string;
  fx_rate_to_aud: number | null;
  sea_freight_rate_aud: number | null;
  local_charges_aud: number | null;
  total_cost_aud: number | null;
  freight_forwarder_id: string | null;
  source_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  origin: FreightLocation | null;
  destination: FreightLocation | null;
  freight_forwarders: FreightForwarder | null;
};
