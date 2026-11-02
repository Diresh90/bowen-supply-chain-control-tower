import type { DispatchStatus, OrderType, ProcurementJob, ProductionStage } from "@/lib/database.types";

// Jobs saved before order types existed fall back to their name.
export function orderTypeOf(job: Pick<ProcurementJob, "order_type" | "client_name" | "sales_order_number"> | undefined): OrderType {
  if (job?.order_type) return job.order_type;
  return job && /stock order/i.test(`${job.client_name} ${job.sales_order_number ?? ""}`) ? "Stock" : "Project";
}

// Job statuses shown in the app. Only Awaiting Confirmation / Confirmed are set by hand on the job;
// the rest are worked out from the job's stages (see jobStatusOf).
export const jobStatuses = ["Awaiting Confirmation", "Confirmed", "In Production", "Partially Dispatched", "Fully Dispatched"] as const;
export type JobStatus = (typeof jobStatuses)[number];

// CSS class giving each job status its own colour (see .job-status in globals.css).
export function statusClass(status: string | null | undefined) {
  return `job-status ${(status || "not-set").toLowerCase().replaceAll(" ", "-")}`;
}

export const statusColours: Record<string, string> = {
  "Awaiting Confirmation": "#8b9aa6",
  Confirmed: "#168cff",
  "In Production": "#f1870d",
  "Partially Dispatched": "#7555e6",
  "Fully Dispatched": "#20af63",
};

export const DISPATCHED_STATUSES: DispatchStatus[] = ["Dispatched", "Sailed", "Arrived"];

// A stage's dispatch status. Stages saved before dispatch statuses existed read it from the tentative
// flag; on jobs already marked Fully Dispatched they count as dispatched.
export function stageStatusOf(stage: Pick<ProductionStage, "dispatch_status" | "tentative"> & { procurement_jobs?: Pick<ProcurementJob, "status"> | null }): DispatchStatus {
  if (stage.dispatch_status) return stage.dispatch_status;
  if (stage.tentative) return "Tentative";
  return stage.procurement_jobs?.status === "Fully Dispatched" ? "Dispatched" : "Confirmed";
}

export function isDispatched(stage: Parameters<typeof stageStatusOf>[0]) {
  return DISPATCHED_STATUSES.includes(stageStatusOf(stage));
}

// Job status worked out from its stages: dispatched containers against the job total.
export function jobStatusOf(job: ProcurementJob, stages: ProductionStage[]): JobStatus {
  const own = stages.filter(stage => stage.procurement_job_id === job.id).map(stage => ({ stage, status: stageStatusOf({ ...stage, procurement_jobs: job }) }));
  const confirmed = own.filter(item => item.status !== "Tentative");
  const dispatched = own.filter(item => DISPATCHED_STATUSES.includes(item.status)).reduce((n, item) => n + item.stage.container_quantity, 0);
  const total = job.total_containers ?? confirmed.reduce((n, item) => n + item.stage.container_quantity, 0);
  if (dispatched > 0 && total > 0 && dispatched >= total) return "Fully Dispatched";
  if (dispatched > 0) return "Partially Dispatched";
  if (job.status === "Awaiting Confirmation" && confirmed.length === 0) return "Awaiting Confirmation";
  if (confirmed.length > 0) return "In Production";
  return "Confirmed";
}

// Containers per dispatch status for one job, for progress bars.
export function jobDispatchCounts(job: ProcurementJob, stages: ProductionStage[]) {
  const counts = { tentative: 0, confirmed: 0, dispatched: 0, sailed: 0, arrived: 0 };
  for (const stage of stages.filter(s => s.procurement_job_id === job.id)) {
    const key = stageStatusOf({ ...stage, procurement_jobs: job }).toLowerCase() as keyof typeof counts;
    counts[key] += stage.container_quantity;
  }
  return counts;
}
