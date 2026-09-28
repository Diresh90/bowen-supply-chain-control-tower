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
