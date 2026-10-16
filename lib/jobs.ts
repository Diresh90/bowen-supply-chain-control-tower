import type { OrderType, ProcurementJob } from "@/lib/database.types";

// Jobs saved before order types existed fall back to their name.
export function orderTypeOf(job: Pick<ProcurementJob, "order_type" | "client_name" | "sales_order_number"> | undefined): OrderType {
  if (job?.order_type) return job.order_type;
  return job && /stock order/i.test(`${job.client_name} ${job.sales_order_number ?? ""}`) ? "Stock" : "Project";
}

// CSS class giving each job status its own colour (see .job-status in globals.css).
export function statusClass(status: string | null | undefined) {
  return `job-status ${(status || "not-set").toLowerCase().replaceAll(" ", "-")}`;
}

export const statusColours: Record<string, string> = {
  "Awaiting Confirmation": "#8b9aa6",
  Confirmed: "#168cff",
  "In Production": "#f1870d",
  "Production Completed": "#7555e6",
  "Fully Dispatched": "#20af63",
};
