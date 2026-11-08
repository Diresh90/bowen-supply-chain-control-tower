"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { DispatchGrid } from "@/components/dispatch-grid";
import { DispatchStatus, dispatchStatuses, PlanningMode, ProcurementJob, ProductionPriority, ProductionStage, productionPriorities, Supplier, SupplierCapacityOverride, SupplierProductionSetting } from "@/lib/database.types";
import { DESTINATION_PORTS, ORIGIN_PORT, freightTotals } from "@/lib/freight";
import { addWeeks, backwardDeadlines, calculateBackwardSchedule, calculateProductionSchedule, capacityMetrics, capacityMonth, plannedBySupplierMonth } from "@/lib/production";
import { orderTypeOf, stageStatusOf } from "@/lib/jobs";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const visibleStatuses = new Set(["Confirmed", "In Production", "Production Completed", "Fully Dispatched"]);
const plannableStatuses = new Set(["Confirmed", "In Production"]);
const emptyForm = {
  procurement_job_id: "", stage_reference: "", container_quantity: "", priority: "Normal" as ProductionPriority,
  queue_sequence: "1", destination: "", dispatch_date: "", production_duration_weeks: "5",
  dispatch_duration_weeks: "2", transit_duration_weeks: "6", destination_duration_weeks: "1",
  required_site_date: "", allocation_override: false,
  planning_mode: "backward" as PlanningMode, dispatch_status: "Confirmed" as DispatchStatus,
  ocean_freight_usd: "", peak_season_surcharge_usd: "", other_surcharges_usd: "", local_charges_aud: "", usd_aud_rate: "",
};

type Tab = "dispatch" | "capacity";
type StageForm = typeof emptyForm;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function jobLabel(job: ProcurementJob) {
  return job.sales_order_number || job.client_name;
}

// Stock orders have no hard site deadline, so they are planned forward from production start.
function isStockOrder(job: ProcurementJob | undefined) {
  return !!job && orderTypeOf(job) === "Stock";
}

function scheduleFor(form: StageForm) {
  const weeks = { productionWeeks: Number(form.production_duration_weeks), dispatchWeeks: Number(form.dispatch_duration_weeks), transitWeeks: Number(form.transit_duration_weeks), destinationWeeks: Number(form.destination_duration_weeks) };
  // Every stage is entered by its planned dispatch date (goods leave the supplier).
  if (form.planning_mode === "backward") return calculateBackwardSchedule({ ...weeks, requiredSiteDate: form.required_site_date, supplierReadyDate: form.dispatch_date || null });
  const productionStart = addWeeks(form.dispatch_date, -weeks.productionWeeks);
  return { production_start: productionStart, ...calculateProductionSchedule({ ...weeks, productionStart, requiredSiteDate: form.required_site_date }) };
}

// Form text <-> nullable number.
function text(value: number | string | null | undefined) { return value === null || value === undefined ? "" : String(value); }
function money(value: string) { return value.trim() === "" ? null : Number(value); }

const usd = new Intl.NumberFormat("en-AU", { style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: 0 });
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", currencyDisplay: "code", maximumFractionDigits: 0 });

// Freight for this shipment, entered per 40ft container. USD charges convert to AUD with the entered rate.
function FreightFields({ form, setForm }: { form: StageForm; setForm: (form: StageForm) => void }) {
  const totals = freightTotals({ container_quantity: Number(form.container_quantity) || 0, ocean_freight_usd: money(form.ocean_freight_usd), peak_season_surcharge_usd: money(form.peak_season_surcharge_usd), other_surcharges_usd: money(form.other_surcharges_usd), local_charges_aud: money(form.local_charges_aud), usd_aud_rate: money(form.usd_aud_rate) });
  const field = (label: string, key: "ocean_freight_usd" | "peak_season_surcharge_usd" | "other_surcharges_usd" | "local_charges_aud" | "usd_aud_rate", step = "0.01") =>
    <label>{label}<input type="number" min="0" step={step} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>;
  return <fieldset className="freight-fields full"><legend>Freight · per 40ft container · {ORIGIN_PORT} → {form.destination || "destination"}</legend><div className="form-grid">
    {field("Ocean freight (USD)", "ocean_freight_usd")}{field("Peak season surcharge (USD)", "peak_season_surcharge_usd")}
    {field("Other surcharges (USD)", "other_surcharges_usd")}{field("USD → AUD rate", "usd_aud_rate", "0.0001")}
    {field("Local charges (AUD)", "local_charges_aud")}
    <div className="freight-totals">
      <span>Sea freight <b>{totals.seaUsd === null ? "—" : `${usd.format(totals.seaUsd)}${totals.seaAud !== null ? ` (${aud.format(totals.seaAud)})` : ""}`}</b></span>
      <span>Local charges <b>{totals.localAud === null ? "—" : aud.format(totals.localAud)}</b></span>
      <span>Total freight <b>{totals.totalAud === null ? (totals.seaUsd !== null ? "Add the USD → AUD rate" : "—") : aud.format(totals.totalAud)}</b></span>
    </div>
  </div></fieldset>;
}

// Columns added by migration 20261102000000 (dispatch status and freight).
const NEW_STAGE_COLUMNS = ["dispatch_status", "ocean_freight_usd", "peak_season_surcharge_usd", "other_surcharges_usd", "local_charges_aud", "usd_aud_rate"];

function scheduleReady(form: StageForm) {
  return !!form.required_site_date && (form.planning_mode === "backward" || !!form.dispatch_date);
}

export default function ProductionPage() {
  const [jobs, setJobs] = useState<ProcurementJob[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [pendingJobs, setPendingJobs] = useState<ProcurementJob[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [capacitySettings, setCapacitySettings] = useState<SupplierProductionSetting[]>([]);
  const [capacityOverrides, setCapacityOverrides] = useState<SupplierCapacityOverride[]>([]);
  const [capacityReady, setCapacityReady] = useState(true);
  const [supplierId, setSupplierId] = useState("all");
  const [tab, setTab] = useState<Tab>("dispatch");
  const [form, setForm] = useState<StageForm>(emptyForm);
  const [editing, setEditing] = useState<ProductionStage | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const [jobRows, stageRows, supplierRows] = await Promise.all([
        supabaseRequest<ProcurementJob[]>("procurement_jobs?select=*,suppliers(id,name,active)&status=neq.Awaiting%20Confirmation&order=required_onsite_date.asc.nullslast"),
        supabaseRequest<ProductionStage[]>("production_stages?select=*,procurement_jobs(*,suppliers(id,name,active)),suppliers(id,name,active)&order=queue_sequence.asc,production_start.asc"),
        supabaseRequest<Supplier[]>("suppliers?select=*&order=name.asc"),
      ]);
      setJobs(jobRows.filter(job => job.status && visibleStatuses.has(job.status)));
      setStages(stageRows); setSuppliers(supplierRows);
      try {
        setPendingJobs(await supabaseRequest<ProcurementJob[]>("procurement_jobs?select=*,suppliers(id,name,active)&status=eq.Awaiting%20Confirmation"));
      } catch { setPendingJobs([]); }
      try {
        const [settings, overrides] = await Promise.all([
          supabaseRequest<SupplierProductionSetting[]>("supplier_production_settings?select=*"),
          supabaseRequest<SupplierCapacityOverride[]>("supplier_capacity_overrides?select=*&order=capacity_month.asc"),
        ]);
        setCapacitySettings(settings); setCapacityOverrides(overrides); setCapacityReady(true);
      } catch { setCapacityReady(false); }
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const allocatedByJob = useMemo(() => stages.reduce<Record<string, number>>((totals, stage) => {
    totals[stage.procurement_job_id] = (totals[stage.procurement_job_id] || 0) + stage.container_quantity;
    return totals;
  }, {}), [stages]);
  const filteredJobs = jobs.filter(job => supplierId === "all" || job.supplier_id === supplierId);
  const filteredStages = stages.filter(stage => supplierId === "all" || stage.supplier_id === supplierId);
  const productionSuppliers = suppliers.filter(supplier => supplier.active);

  // Defaults when a job is picked for a new stage: next stage number, containers still to plan,
  // the job's required date and planning method. Orders awaiting confirmation start as Tentative.
  function newStageDefaults(job: ProcurementJob) {
    const remaining = Math.max(0, (job.total_containers || 0) - (allocatedByJob[job.id] || 0));
    return {
      procurement_job_id: job.id, stage_reference: `${job.client_name} Stage ${stages.filter(s => s.procurement_job_id === job.id).length + 1}`,
      container_quantity: remaining ? String(remaining) : "", required_site_date: job.required_onsite_date || "",
      planning_mode: (isStockOrder(job) ? "forward" : "backward") as PlanningMode, dispatch_status: (job.status === "Awaiting Confirmation" ? "Tentative" : "Confirmed") as DispatchStatus,
    };
  }

  function startNew() {
    setEditing(null); setFormError(null);
    const lastFx = [...stages].filter(stage => stage.usd_aud_rate).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]?.usd_aud_rate;
    setForm({ ...emptyForm, queue_sequence: String(stages.length + 1), usd_aud_rate: text(lastFx) });
    setOpen(true); setMessage(null);
  }

  // Stages saved before planning modes existed default by order type. The form opens with the stage's
  // current dispatch date, so saving without changes moves nothing. A project stage still waiting on
  // a dispatch date (its stored ready date is only the deadline) opens blank.
  function editModeFor(stage: ProductionStage) {
    const planning_mode: PlanningMode = stage.planning_mode ?? (isStockOrder(stage.procurement_jobs) ? "forward" : "backward");
    const dispatch_date = planning_mode === "backward" && stage.planning_mode ? stage.supplier_ready_date ?? "" : stage.goods_ready_date;
    return { planning_mode, dispatch_date };
  }

  function startEdit(stage: ProductionStage) {
    setEditing(stage); setFormError(null);
    setForm({ procurement_job_id: stage.procurement_job_id, stage_reference: stage.stage_reference, container_quantity: String(stage.container_quantity), priority: stage.priority, queue_sequence: String(stage.queue_sequence), destination: stage.destination || "", production_duration_weeks: String(stage.production_duration_weeks), dispatch_duration_weeks: String(stage.dispatch_duration_weeks), transit_duration_weeks: String(stage.transit_duration_weeks), destination_duration_weeks: String(stage.destination_duration_weeks), required_site_date: stage.required_site_date, allocation_override: stage.allocation_override, dispatch_status: stageStatusOf(stage), ocean_freight_usd: text(stage.ocean_freight_usd), peak_season_surcharge_usd: text(stage.peak_season_surcharge_usd), other_surcharges_usd: text(stage.other_surcharges_usd), local_charges_aud: text(stage.local_charges_aud), usd_aud_rate: text(stage.usd_aud_rate), ...editModeFor(stage) });
    setOpen(true); setMessage(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const job = [...jobs, ...pendingJobs].find(item => item.id === form.procurement_job_id);
    if (!job?.supplier_id) { setFormError("This procurement job must have an approved supplier before it can be planned."); return; }
    const quantity = Number(form.container_quantity);
    const allocatedElsewhere = (allocatedByJob[job.id] || 0) - (editing?.container_quantity || 0);
    const total = job.total_containers;
    if (total !== null && allocatedElsewhere + quantity > total && !form.allocation_override) {
      setFormError(`This stage would allocate ${allocatedElsewhere + quantity} of ${total} containers. Review the warning and confirm the override to continue.`);
      return;
    }
    const schedule = scheduleFor(form);
    const payload = { procurement_job_id: job.id, supplier_id: job.supplier_id, stage_reference: form.stage_reference.trim(), container_quantity: quantity, priority: form.priority, queue_sequence: Number(form.queue_sequence), destination: form.destination.trim() || null, production_duration_weeks: Number(form.production_duration_weeks), dispatch_duration_weeks: Number(form.dispatch_duration_weeks), transit_duration_weeks: Number(form.transit_duration_weeks), destination_duration_weeks: Number(form.destination_duration_weeks), required_site_date: form.required_site_date, allocation_override: form.allocation_override, planning_mode: form.planning_mode, supplier_ready_date: form.planning_mode === "backward" ? form.dispatch_date || null : null, dispatch_status: form.dispatch_status, tentative: form.dispatch_status === "Tentative", ocean_freight_usd: money(form.ocean_freight_usd), peak_season_surcharge_usd: money(form.peak_season_surcharge_usd), other_surcharges_usd: money(form.other_surcharges_usd), local_charges_aud: money(form.local_charges_aud), usd_aud_rate: money(form.usd_aud_rate), ...schedule };
    setSaving(true); setMessage(null); setFormError(null);
    const send = (body: Record<string, unknown>) => editing
      ? supabaseRequest(`production_stages?id=eq.${editing.id}`, { method: "PATCH", body })
      : supabaseRequest("production_stages", { method: "POST", body });
    try {
      let skipped = false;
      try { await send(payload); }
      catch (error) {
        // Before the dispatch-status / freight migration is run those columns don't exist: save everything else.
        if (!/does not exist|schema cache/i.test((error as Error).message)) throw error;
        const rest: Record<string, unknown> = { ...payload };
        for (const key of NEW_STAGE_COLUMNS) delete rest[key];
        await send(rest);
        skipped = true;
      }
      setOpen(false); await load();
      setMessage(skipped
        ? { text: `Production stage ${editing ? "updated" : "created"}. Its dispatch status and freight weren't saved because the database update for them hasn't been run yet (migration 20261102000000).`, kind: "error" }
        : { text: `Production stage ${editing ? "updated" : "created"} in Supabase.`, kind: "success" });
    } catch (error) { setFormError((error as Error).message); }
    finally { setSaving(false); }
  }

  async function remove(stage: ProductionStage) {
    if (!confirm(`Delete ${stage.stage_reference}? The procurement job will be preserved.`)) return;
    try { await supabaseRequest(`production_stages?id=eq.${stage.id}`, { method: "DELETE" }); setOpen(false); await load(); setMessage({ text: "Production stage deleted. Its containers are available for planning again.", kind: "success" }); }
    catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
  }

  const selectedJob = [...jobs, ...pendingJobs].find(job => job.id === form.procurement_job_id);
  const otherAllocation = selectedJob ? (allocatedByJob[selectedJob.id] || 0) - (editing?.container_quantity || 0) : 0;
  const proposedAllocation = otherAllocation + (Number(form.container_quantity) || 0);
  const exceedsTotal = selectedJob?.total_containers !== null && selectedJob?.total_containers !== undefined && proposedAllocation > selectedJob.total_containers;
  const capacityForecast = useMemo(() => {
    if (!selectedJob?.supplier_id || !scheduleReady(form)) return null;
    const schedule = scheduleFor(form);
    const month = capacityMonth(schedule.goods_ready_date);
    const capacity = capacityOverrides.find(row => row.supplier_id === selectedJob.supplier_id && row.capacity_month === month)?.container_capacity ?? null;
    const alreadyPlanned = stages.filter(stage => stage.supplier_id === selectedJob.supplier_id && capacityMonth(stage.goods_ready_date) === month && stage.id !== editing?.id).reduce((sum, stage) => sum + stage.container_quantity, 0);
    return { month, capacity, alreadyPlanned, stage: Number(form.container_quantity) || 0, metrics: capacityMetrics(capacity, alreadyPlanned + (Number(form.container_quantity) || 0)) };
  }, [selectedJob, form, capacityOverrides, stages, editing]);

  return <AppShell>
    <header className="page-header production-header"><div><p className="eyebrow">SUPPLIER PLANNING</p><h1>Production</h1><p>Plan dispatch weeks against supplier capacity.</p></div><div className="production-actions"><button className="primary" onClick={startNew}>＋ Add stage</button><div className="supplier-filter"><label htmlFor="supplier-filter">Supplier</label><select id="supplier-filter" value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="all">All approved suppliers</option>{productionSuppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div></div></header>
    {message && <Notice message={message.text} kind={message.kind} />}{configurationError() && !message && <Notice message={configurationError()!} />}
    <section className="metric-row production-metrics"><div className="metric"><span>Eligible jobs</span><strong>{filteredJobs.length}</strong></div><div className="metric"><span>Production stages</span><strong>{filteredStages.length}</strong></div><div className="metric"><span>Containers allocated</span><strong>{filteredStages.reduce((sum, stage) => sum + stage.container_quantity, 0)}</strong></div></section>
    <div className="module-tabs" role="tablist"><button className={tab === "dispatch" ? "selected" : ""} onClick={() => setTab("dispatch")}>Dispatch Plan</button><button className={tab === "capacity" ? "selected" : ""} onClick={() => setTab("capacity")}>Capacity</button></div>

    {tab === "dispatch" && <DispatchGrid stages={filteredStages} overrides={capacityOverrides} supplierId={supplierId} loading={loading} onEdit={startEdit} />}
    {tab === "capacity" && <CapacityView supplierId={supplierId} suppliers={productionSuppliers} stages={stages} settings={capacitySettings} overrides={capacityOverrides} ready={capacityReady} onEdit={startEdit} onRefresh={load} onMessage={setMessage} />}

    {open && <div className="modal-backdrop" onMouseDown={() => !saving && setOpen(false)}><div className="modal production-modal" role="dialog" aria-modal="true" aria-labelledby="stage-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">PRODUCTION STAGE</p><h2 id="stage-title">{editing ? "Edit stage" : "Create stage"}</h2><p className="modal-context">{selectedJob ? `${jobLabel(selectedJob)} · ${selectedJob.client_name}` : "Linked procurement plan"}</p></div><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>×</button></div><form onSubmit={save}>{formError && <Notice message={formError} kind="error" />}<div className="form-grid stage-form">
      <label className="full">Procurement job<select required disabled={!!editing} value={form.procurement_job_id} onChange={e => { const job = [...jobs, ...pendingJobs].find(item => item.id === e.target.value); setForm(job ? { ...form, ...newStageDefaults(job) } : { ...form, procurement_job_id: "" }); }}><option value="">Select a job</option>{[...jobs.filter(job => plannableStatuses.has(job.status || "") && job.supplier_id), ...pendingJobs.filter(job => job.supplier_id)].map(job => <option key={job.id} value={job.id}>{jobLabel(job)} — {job.client_name}{job.status === "Awaiting Confirmation" ? " (awaiting confirmation)" : ""}</option>)}</select></label>
      <label>Stage reference *<input required value={form.stage_reference} onChange={e => setForm({...form, stage_reference:e.target.value})} /></label><label>Container quantity *<input required type="number" min="1" value={form.container_quantity} onChange={e => setForm({...form, container_quantity:e.target.value})} /></label>
      <div className="planning-mode full"><strong>{form.planning_mode === "backward" ? "Project order · planned back from the on-site date" : "Stock order · planned forward from dispatch"}</strong><span>{form.planning_mode === "backward" ? "Enter the planned dispatch date to see if it lands on time." : "Enter the planned dispatch date; production start is worked out from it."}</span></div>
      <label>Required on-site date *<input required type="date" value={form.required_site_date} onChange={e => setForm({...form, required_site_date:e.target.value})} /></label>
      <label>Planned dispatch date{form.planning_mode === "forward" ? " *" : ""}<input required={form.planning_mode === "forward"} type="date" value={form.dispatch_date} onChange={e => setForm({...form, dispatch_date:e.target.value})} /></label>
      <div className="full dispatch-status-field"><span>Dispatch status</span><div className="status-steps" role="radiogroup" aria-label="Dispatch status">{dispatchStatuses.map(status => <button type="button" role="radio" aria-checked={form.dispatch_status === status} key={status} className={`status-step ${status.toLowerCase()}${form.dispatch_status === status ? " selected" : ""}`} onClick={() => setForm({ ...form, dispatch_status: status })}>{status}</button>)}</div><small>Tentative is shown dashed. Every status counts toward capacity. Dispatched, Sailed and Arrived count as dispatched on the job and dashboard.</small></div>
      <label className="full">Destination port<input list="destination-ports" value={form.destination} onChange={e => setForm({...form, destination:e.target.value})} placeholder="Brisbane, Sydney or Melbourne" /><datalist id="destination-ports">{DESTINATION_PORTS.map(port => <option key={port} value={port} />)}</datalist></label>
      <FreightFields form={form} setForm={setForm} />
      {scheduleReady(form) && <SchedulePreview form={form} />}
      <details className="adjust-timings full"><summary>Adjust timings, priority and queue</summary><div className="form-grid">
        <label>Production (weeks)<input required type="number" min="0" value={form.production_duration_weeks} onChange={e => setForm({...form, production_duration_weeks:e.target.value})} /></label>
        <label>Dispatch: loading + origin transport (weeks)<input required type="number" min="0" value={form.dispatch_duration_weeks} onChange={e => setForm({...form, dispatch_duration_weeks:e.target.value})} /></label>
        <label>Sea transit (weeks)<input required type="number" min="0" value={form.transit_duration_weeks} onChange={e => setForm({...form, transit_duration_weeks:e.target.value})} /></label>
        <label>Delivery to site (weeks)<input required type="number" min="0" value={form.destination_duration_weeks} onChange={e => setForm({...form, destination_duration_weeks:e.target.value})} /></label>
        <label>Priority<select value={form.priority} onChange={e => setForm({...form, priority:e.target.value as ProductionPriority})}>{productionPriorities.map(priority => <option key={priority}>{priority}</option>)}</select></label><label>Queue sequence<input required type="number" min="1" value={form.queue_sequence} onChange={e => setForm({...form, queue_sequence:e.target.value})} /></label>
        <label className="full">Planning method<select value={form.planning_mode} onChange={e => setForm({...form, planning_mode:e.target.value as PlanningMode})}><option value="backward">Project order: plan back from on-site date</option><option value="forward">Stock order: plan forward from production start</option></select></label>
      </div></details>
      {exceedsTotal && <div className="allocation-warning full"><strong>Allocation warning</strong><span>This saves {proposedAllocation} containers against a procurement total of {selectedJob?.total_containers}. An explicit override is required.</span><label className="check"><input type="checkbox" checked={form.allocation_override} onChange={e => setForm({...form, allocation_override:e.target.checked})} /> Confirm allocation override</label></div>}
      {capacityForecast && <div className={`capacity-warning full ${capacityForecast.metrics.status === "Over Capacity" ? "danger" : ""}`}><strong>{formatDate(capacityForecast.month)} supplier capacity</strong><span>Capacity: {capacityForecast.capacity ?? "Not set"} · Already planned: {capacityForecast.alreadyPlanned} · This stage: {capacityForecast.stage} · Forecast: {capacityForecast.metrics.planned}</span>{capacityForecast.capacity !== null && <b>{capacityForecast.metrics.remaining! < 0 ? `OVER CAPACITY BY ${Math.abs(capacityForecast.metrics.remaining!)} CONTAINERS` : `Remaining after stage: ${capacityForecast.metrics.remaining}`}</b>}</div>}
    </div><div className="modal-actions">{editing && <button type="button" className="danger-link stage-delete" disabled={saving} onClick={() => void remove(editing)}>Delete stage</button>}<button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving to Supabase…" : "Save production stage"}</button></div></form></div></div>}
  </AppShell>;
}

function CapacityView({ supplierId, suppliers, stages, overrides, ready, onEdit, onRefresh, onMessage }: { supplierId: string; suppliers: Supplier[]; stages: ProductionStage[]; settings: SupplierProductionSetting[]; overrides: SupplierCapacityOverride[]; ready: boolean; onEdit: (stage: ProductionStage) => void; onRefresh: () => Promise<void>; onMessage: (message: { text: string; kind: "error" | "success" } | null) => void }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [saving, setSaving] = useState(false);
  const [bulkCapacity, setBulkCapacity] = useState("");
  const selectedSupplier = suppliers.find(supplier => supplier.id === supplierId);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, index, 1))), [year]);
  const planned = useMemo(() => plannedBySupplierMonth(stages), [stages]);
  const allocations = (key: string) => stages.filter(stage => stage.supplier_id === supplierId && capacityMonth(stage.goods_ready_date) === key);
  async function saveCapacity(key: string, value: string) {
    setSaving(true);
    try {
      if (value === "") await supabaseRequest(`supplier_capacity_overrides?supplier_id=eq.${supplierId}&capacity_month=eq.${key}`, { method: "DELETE" });
      else await supabaseRequest("supplier_capacity_overrides?on_conflict=supplier_id,capacity_month", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: { supplier_id: supplierId, capacity_month: key, container_capacity: Number(value) } });
      await onRefresh(); onMessage({ text: value === "" ? "Capacity configuration removed; production stages were not changed." : `Capacity saved for ${formatDate(key)}.`, kind: "success" });
    } catch (error) { onMessage({ text: (error as Error).message, kind: "error" }); } finally { setSaving(false); }
  }
  async function applyYear() {
    if (!bulkCapacity || !confirm(`Set ${bulkCapacity} containers for all currently unconfigured months in ${year}? Existing monthly values will be preserved.`)) return;
    const body = months.map(capacityMonth).filter(month => !overrides.some(row => row.supplier_id === supplierId && row.capacity_month === month)).map(capacity_month => ({ supplier_id: supplierId, capacity_month, container_capacity: Number(bulkCapacity) }));
    if (!body.length) { onMessage({ text: "Every month already has an override; nothing was changed.", kind: "success" }); return; }
    setSaving(true); try { await supabaseRequest("supplier_capacity_overrides?on_conflict=supplier_id,capacity_month", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body }); await onRefresh(); onMessage({ text: `Capacity applied to ${body.length} unconfigured months.`, kind: "success" }); } catch (error) { onMessage({ text: (error as Error).message, kind: "error" }); } finally { setSaving(false); }
  }
  if (supplierId === "all") return <section className="panel"><div className="panel-title"><div><h2>Supplier capacity</h2><p>Capacity is supplier-specific and based on each stage&apos;s dispatch month (the date goods are ready to leave the supplier). Every stage counts, tentative included.</p></div></div><div className="empty"><strong>Select an active supplier</strong><span>Use the Supplier selector at the top of Production.</span></div></section>;
  if (!ready) return <section className="panel"><div className="panel-title"><div><h2>Supplier capacity</h2></div></div><div className="empty"><strong>Capacity migration required</strong><span>Run 20260928020000_add_supplier_production_capacity.sql in Supabase.</span></div></section>;
  return <section className="panel capacity-panel"><div className="panel-title capacity-heading"><div><h2>{selectedSupplier?.name} capacity</h2><p>Monthly capacity is configured explicitly; blank means Capacity Not Set.</p></div><div className="capacity-setting"><label>Year<select value={year} onChange={event => setYear(Number(event.target.value))}>{Array.from({length:5},(_,i)=>now.getUTCFullYear()-1+i).map(value=><option key={value}>{value}</option>)}</select></label><label>Set unconfigured months<input min="0" type="number" value={bulkCapacity} onChange={event => setBulkCapacity(event.target.value)} placeholder="Containers" /></label><button className="primary" disabled={saving} onClick={applyYear}>Apply</button></div></div><div className="capacity-grid">{months.map(month => { const key = capacityMonth(month); const rows = allocations(key); const allocated = planned[`${supplierId}:${key}`] || 0; const override = overrides.find(item => item.supplier_id === supplierId && item.capacity_month === key); const metrics = capacityMetrics(override?.container_capacity ?? null, allocated); const ratio = metrics.utilisation === null ? 0 : Math.min(metrics.utilisation, 100); return <article className={`capacity-card ${metrics.status.toLowerCase().replaceAll(" ", "-")}`} key={key}><button className="capacity-card-main" onClick={() => setSelectedMonth(selectedMonth === key ? null : key)}><span>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}</span><strong>{override ? override.container_capacity : "—"} <small>capacity</small> · {allocated} <small>planned</small></strong><i style={{ width: `${ratio}%` }} /><b>{metrics.remaining === null ? "Capacity not configured" : metrics.remaining >= 0 ? `Remaining: ${metrics.remaining}` : `Over capacity: ${Math.abs(metrics.remaining)}`}</b><em>{metrics.utilisation === null ? "—" : Number.isFinite(metrics.utilisation) ? `${metrics.utilisation.toFixed(2)}% · ` : "∞ · "}{metrics.status}</em></button><label className="override-field">Monthly capacity<input type="number" min="0" key={`${key}-${override?.container_capacity ?? "unset"}`} defaultValue={override?.container_capacity ?? ""} placeholder="Not set" onBlur={event => event.target.value !== String(override?.container_capacity ?? "") && void saveCapacity(key, event.target.value)} /></label>{selectedMonth === key && <div className="capacity-detail"><strong>Production stages using this month</strong>{rows.length ? rows.map(stage => <button className="capacity-stage-link" key={stage.id} onClick={() => onEdit(stage)}><span>{stage.procurement_jobs.sales_order_number || stage.procurement_jobs.client_name} · {stage.stage_reference}<small>Dispatch {formatDate(stage.goods_ready_date)}</small></span><b>{stage.container_quantity}</b></button>) : <span>No stages dispatching this month.</span>}<span className="capacity-total">Total<b>{allocated}</b></span></div>}</article>; })}</div></section>;
}
function timingClass(status: string) {
  return status.startsWith("Late") ? "late" : status === "Supplier date needed" ? "pending" : "";
}

function SchedulePreview({ form }: { form: StageForm }) {
  const schedule = scheduleFor(form);
  if (form.planning_mode === "backward") {
    const deadlines = backwardDeadlines({ requiredSiteDate: form.required_site_date, supplierReadyDate: form.dispatch_date || null, productionWeeks: Number(form.production_duration_weeks), dispatchWeeks: Number(form.dispatch_duration_weeks), transitWeeks: Number(form.transit_duration_weeks), destinationWeeks: Number(form.destination_duration_weeks) });
    return <div className="backward-preview full">
      <p>Latest dates to be on site {formatDate(form.required_site_date)}</p>
      <div className="schedule-preview"><span><small>Start production by</small>{formatDate(deadlines.start_by)}</span><span><small>Dispatch by</small>{formatDate(deadlines.ready_by)}</span><span><small>Sail (ETD) by</small>{formatDate(deadlines.sail_by)}</span><span><small>Port arrival by</small>{formatDate(deadlines.port_eta_by)}</span><span><small>Timing</small><b className={`timing ${timingClass(schedule.timing_status)}`}>{schedule.timing_status}</b></span></div>
      {form.dispatch_date && <><p>Forecast from planned dispatch {formatDate(form.dispatch_date)}</p>
      <div className="schedule-preview"><span><small>Production start</small>{formatDate(schedule.production_start)}</span><span><small>Planned ETD</small>{formatDate(schedule.planned_etd)}</span><span><small>Port ETA</small>{formatDate(schedule.port_eta)}</span><span><small>Forecast on site</small>{formatDate(schedule.forecast_site_eta)}</span><span><small>Required on site</small>{formatDate(form.required_site_date)}</span></div></>}
    </div>;
  }
  return <div className="schedule-preview full"><span><small>Production start</small>{formatDate(schedule.production_start)}</span><span><small>Planned ETD</small>{formatDate(schedule.planned_etd)}</span><span><small>Port ETA</small>{formatDate(schedule.port_eta)}</span><span><small>Forecast site ETA</small>{formatDate(schedule.forecast_site_eta)}</span><span><small>Timing</small><b className={schedule.timing_status.startsWith("Late") ? "negative" : "remaining"}>{schedule.timing_status}</b></span></div>;
}
