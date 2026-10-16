"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { FreightBooking, OrderType, ProcurementJob, ProductionStage, Supplier, SupplierCapacityOverride, procurementStatuses } from "@/lib/database.types";
import { AttentionItem, Severity, STANDARD_WEEKS, attentionItems, capacityRows, daysBetween, estimateNewOrder, formatDate, jobLabel, summariseJobs } from "@/lib/dashboard";
import { statusClass, statusColours } from "@/lib/jobs";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const severityLabel: Record<Severity, string> = { high: "Act now", medium: "Check", low: "Follow up" };
const ARRIVING_DAYS = 30;
const CHART_MONTHS = 6;

export default function Home() {
  const [jobs, setJobs] = useState<ProcurementJob[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [bookings, setBookings] = useState<FreightBooking[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [capacities, setCapacities] = useState<SupplierCapacityOverride[]>([]);
  const [capacityAvailable, setCapacityAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | OrderType>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [managerFilter, setManagerFilter] = useState("all");
  const [capacitySupplierId, setCapacitySupplierId] = useState("");
  const [quoteContainers, setQuoteContainers] = useState("5");

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    const coreData = Promise.all([
      supabaseRequest<ProcurementJob[]>("procurement_jobs?select=*,suppliers(id,name,active)&order=updated_at.desc"),
      supabaseRequest<ProductionStage[]>("production_stages?select=*,procurement_jobs(*,suppliers(id,name,active)),suppliers(id,name,active)&order=planned_etd.asc"),
      supabaseRequest<FreightBooking[]>("freight_bookings?select=*,procurement_jobs(*,suppliers(id,name,active)),production_stages(*),suppliers(id,name,active),freight_references(*),freight_forwarders(*),origin:locations!freight_bookings_origin_location_id_fkey(*),destination:locations!freight_bookings_destination_location_id_fkey(*)&archived_at=is.null&order=updated_at.desc"),
    ]);
    const capacityData = Promise.all([
      supabaseRequest<Supplier[]>("suppliers?select=*&active=eq.true&order=name.asc"),
      supabaseRequest<SupplierCapacityOverride[]>("supplier_capacity_overrides?select=*"),
    ]);
    const [coreResult, capacityResult] = await Promise.allSettled([coreData, capacityData]);
    if (coreResult.status === "fulfilled") {
      const [jobRows, stageRows, bookingRows] = coreResult.value;
      setJobs(jobRows); setStages(stageRows); setBookings(bookingRows);
    } else setMessage((coreResult.reason as Error).message);
    if (capacityResult.status === "fulfilled") {
      const [supplierRows, capacityRowsData] = capacityResult.value;
      setSuppliers(supplierRows); setCapacities(capacityRowsData); setCapacityAvailable(true);
    } else { setSuppliers([]); setCapacities([]); setCapacityAvailable(false); }
    setLoadedAt(new Date()); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const today = useMemo(() => (loadedAt ?? new Date()).toISOString().slice(0, 10), [loadedAt]);
  const summaries = useMemo(() => summariseJobs(jobs, stages, bookings), [jobs, stages, bookings]);
  const capacity = useMemo(() => capacityRows(suppliers, capacities, stages, 12), [suppliers, capacities, stages]);
  const attention = useMemo(() => attentionItems(summaries, bookings, capacity.map(row => ({ ...row, months: row.months.slice(0, 3) })), today), [summaries, bookings, capacity, today]);
  const attentionByJob = useMemo(() => attention.reduce<Record<string, AttentionItem[]>>((map, item) => { if (item.jobId) (map[item.jobId] ||= []).push(item); return map; }, {}), [attention]);
  const ready = !(loading && !loadedAt);
  const show = (value: number | string) => (ready ? value : "—");

  // Headline numbers
  const openOrders = summaries.filter(s => s.job.status !== "Fully Dispatched");
  const lateOrders = summaries.filter(s => s.timing === "Late" && s.shipped < s.ordered);
  const arrivingLimit = new Date(Date.parse(`${today}T00:00:00Z`) + ARRIVING_DAYS * 86_400_000).toISOString().slice(0, 10);
  const arriving = stages.filter(stage => stage.forecast_site_eta >= today && stage.forecast_site_eta <= arrivingLimit);
  const arrivingOrders = new Set(arriving.map(stage => stage.procurement_job_id)).size;

  // Capacity chart and new-order estimate
  const capacityRow = capacity.find(row => row.supplier.id === capacitySupplierId) ?? capacity[0];
  const chartMonths = capacityRow?.months.slice(0, CHART_MONTHS) ?? [];
  const chartMax = Math.max(1, ...chartMonths.map(m => Math.max(m.capacity ?? 0, m.planned)));
  // Months a new order could still use: from next month onward.
  const freeSoon = capacityRow?.months.slice(1, 4) ?? [];
  const quoteQty = Math.max(1, Math.round(Number(quoteContainers) || 1));
  const estimate = estimateNewOrder(capacityRow, quoteQty, today);

  // Orders table
  const managers = [...new Set(jobs.map(job => job.project_manager).filter((m): m is string => !!m))].sort();
  const statusCounts = procurementStatuses.map(status => ({ status, count: summaries.filter(s => s.job.status === status && (typeFilter === "all" || s.orderType === typeFilter)).length }));
  const query = search.trim().toLowerCase();
  const tableRows = summaries
    .filter(s => typeFilter === "all" || s.orderType === typeFilter)
    .filter(s => statusFilter === "all" || (statusFilter === "open" ? s.job.status !== "Fully Dispatched" : s.job.status === statusFilter))
    .filter(s => managerFilter === "all" || s.job.project_manager === managerFilter)
    .filter(s => !query || [s.job.sales_order_number, s.job.client_name, s.job.supplier_po_number, s.job.project_manager, s.job.suppliers?.name].join(" ").toLowerCase().includes(query))
    .sort((a, b) => (a.forecastOnSite ?? a.job.required_onsite_date ?? "9999").localeCompare(b.forecastOnSite ?? b.job.required_onsite_date ?? "9999"));

  const totals = summaries.reduce((t, s) => ({ ordered: t.ordered + s.ordered, planned: t.planned + s.planned, booked: t.booked + s.booked, shipped: t.shipped + s.shipped, toPlan: t.toPlan + s.toPlan, toBook: t.toBook + s.toBook }), { ordered: 0, planned: 0, booked: 0, shipped: 0, toPlan: 0, toBook: 0 });

  return <AppShell>
    <header className="dashboard-head">
      <div><h1>Supply Chain Dashboard</h1><p className="db-subtitle">Where every order is, when it lands, and how much capacity is left.</p></div>
      <div className="dashboard-actions">
        <span className="live-data-indicator"><i /> {loadedAt ? `Live data · updated ${loadedAt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}` : "Live Supabase data"}</span>
        <button onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
      </div>
    </header>
    {message && <Notice message={message} />} {configurationError() && !message && <Notice message={configurationError()!} />}

    <section className="db-kpis">
      <article className="db-kpi blue"><span>Open orders</span><strong>{show(openOrders.length)}</strong><small>{show(`${openOrders.filter(s => s.orderType === "Project").length} project · ${openOrders.filter(s => s.orderType === "Stock").length} stock · ${openOrders.reduce((n, s) => n + s.ordered, 0)} containers`)}</small></article>
      <article className="db-kpi green"><span>Arriving on site · next {ARRIVING_DAYS} days</span><strong>{show(arriving.reduce((n, s) => n + s.container_quantity, 0))}</strong><small>{show(`containers across ${arrivingOrders} order${arrivingOrders === 1 ? "" : "s"}`)}</small></article>
      <article className={`db-kpi ${lateOrders.length ? "red" : "green"}`}><span>Late orders</span><strong>{show(lateOrders.length)}</strong><small>{show(lateOrders.length ? `Worst: ${Math.max(...lateOrders.map(s => s.worstLateDays))} days late` : "All forecast on time")}</small></article>
      <article className="db-kpi purple"><span>Free capacity · next 3 months</span><strong>{show(freeSoon.reduce((n, m) => n + Math.max(0, m.free ?? 0), 0))}</strong><small>{show(freeSoon.length ? freeSoon.map(m => `${m.label.slice(0, 3)}: ${m.free === null ? "not set" : Math.max(0, m.free)}`).join(" · ") : "No capacity set")}</small></article>
    </section>

    <section className="db-grid">
      <article className="dash-panel db-capacity">
        <div className="db-panel-head"><div><h2>Capacity outlook</h2><p>Containers planned against monthly capacity, by ETD month.</p></div>
          {capacity.length > 1 && <select aria-label="Supplier" value={capacityRow?.supplier.id} onChange={e => setCapacitySupplierId(e.target.value)}>{capacity.map(row => <option key={row.supplier.id} value={row.supplier.id}>{row.supplier.name}</option>)}</select>}
        </div>
        {!capacityAvailable ? <div className="capacity-unavailable">Capacity data unavailable</div> : !ready ? <div className="empty">Loading capacity…</div> : !capacityRow ? <div className="capacity-unavailable">No supplier capacity set yet</div> : <>
          <div className="db-cap-chart">
            {chartMonths.map(m => {
              const tone = m.status.toLowerCase().replaceAll(" ", "-");
              return <div className="db-cap-col" key={m.month} title={`${m.label}: ${m.planned} planned of ${m.capacity ?? "no"} capacity`}>
                <span className="db-cap-value">{m.capacity === null ? `${m.planned} / —` : `${m.planned} / ${m.capacity}`}</span>
                <div className="db-cap-track">
                  {m.capacity !== null && <span className="db-cap-limit" style={{ height: `${m.capacity / chartMax * 100}%` }} />}
                  <span className={`db-cap-fill ${tone}`} style={{ height: `${m.planned / chartMax * 100}%` }} />
                </div>
                <span className="db-cap-month">{m.label}</span>
                <span className={`db-cap-free ${tone}`}>{m.free === null ? "Not set" : m.free < 0 ? `${-m.free} over` : `${m.free} free`}</span>
              </div>;
            })}
          </div>
          <p className="db-legend"><span className="db-key planned" /> Planned <span className="db-key limit" /> Capacity · <span className="db-key near" /> 80%+ used <span className="db-key over" /> Full / over</p>
        </>}
        <Link className="db-panel-link" href="/production">Manage capacity →</Link>
      </article>

      <article className="dash-panel db-quote">
        <h2>New order delivery estimate</h2>
        <p className="db-panel-note">If a project order is confirmed today, when could it be on site?</p>
        <label className="db-quote-input">Containers<input type="number" min="1" step="1" value={quoteContainers} onChange={e => setQuoteContainers(e.target.value)} /></label>
        {!ready ? <div className="empty">Calculating…</div> : estimate.etd === null ? <p className="db-quote-none">{estimate.reason}</p> : <div className="db-quote-result">
          <span>Earliest on site</span><strong>{formatDate(estimate.onSite)}</strong>
          <small>Ships {formatDate(estimate.etd)} ({estimate.month}, {estimate.free} containers free{capacityRow ? ` at ${capacityRow.supplier.name}` : ""})</small>
        </div>}
        <p className="db-quote-basis">Based on {STANDARD_WEEKS.production} wks production, {STANDARD_WEEKS.dispatch} wks loading and origin transport, {STANDARD_WEEKS.transit} wks sea, {STANDARD_WEEKS.delivery} wk delivery. Confirm with production before quoting.</p>
      </article>
    </section>

    <section className="dash-panel all-jobs">
      <div className="all-jobs-title">
        <div><h2>Where are the orders</h2><p>{ready ? `${tableRows.length} of ${jobs.length} orders · soonest arrival first` : "Loading current records…"}</p></div>
        <div className="db-table-tools">
          <input aria-label="Search orders" placeholder="Search order, client, PO…" value={search} onChange={e => setSearch(e.target.value)} />
          <select aria-label="Order type" value={typeFilter} onChange={e => setTypeFilter(e.target.value as "all" | OrderType)}><option value="all">All types</option><option value="Project">Project orders</option><option value="Stock">Stock orders</option></select>
          <select aria-label="Project manager" value={managerFilter} onChange={e => setManagerFilter(e.target.value)}><option value="all">All project managers</option>{managers.map(m => <option key={m} value={m}>{m}</option>)}</select>
        </div>
      </div>
      <div className="db-status-chips" role="group" aria-label="Filter by status">
        <button className={statusFilter === "open" ? "selected" : ""} onClick={() => setStatusFilter("open")}>Open orders</button>
        <button className={statusFilter === "all" ? "selected" : ""} onClick={() => setStatusFilter("all")}>All</button>
        {statusCounts.map(x => <button key={x.status} className={statusFilter === x.status ? "selected" : ""} onClick={() => setStatusFilter(statusFilter === x.status ? "open" : x.status)}><i style={{ background: statusColours[x.status] }} />{x.status}<b>{show(x.count)}</b></button>)}
      </div>
      <div className="table-wrap"><table><thead><tr><th>Job / sales order</th><th>Type</th><th>Project manager</th><th>Status</th><th>Progress</th><th>Forecast on site</th><th>Required on site</th><th>Timing</th></tr></thead><tbody>
        {!ready ? <tr><td colSpan={8} className="empty">Loading live order data…</td></tr> : tableRows.length === 0 ? <tr><td colSpan={8} className="empty"><strong>No orders match these filters</strong><span>Try another status, type or search.</span></td></tr> : tableRows.map(s => {
          const flags = attentionByJob[s.job.id] || [];
          const details = [jobLabel(s.job) !== s.job.client_name ? s.job.client_name : null, s.job.supplier_po_number && s.job.supplier_po_number.toUpperCase() !== "NA" ? `PO ${s.job.supplier_po_number}` : null, s.job.suppliers?.name].filter(Boolean).join(" · ");
          const pct = (n: number) => `${s.ordered ? Math.min(100, n / s.ordered * 100) : 0}%`;
          const margin = s.forecastOnSite && s.job.required_onsite_date ? daysBetween(s.forecastOnSite, s.job.required_onsite_date) : null;
          return <tr key={s.job.id}>
            <td><strong>{flags.length > 0 && <span className={`db-flag ${flags[0].severity}`} title={flags.map(f => f.title).join("\n")}>●</span>}{jobLabel(s.job)}</strong><small>{details || "—"}</small></td>
            <td><span className={`order-type ${s.orderType.toLowerCase()}`}>{s.orderType}</span></td>
            <td>{s.job.project_manager || "—"}</td>
            <td><span className={statusClass(s.job.status)}>{s.job.status || "Not set"}</span></td>
            <td><div className="db-progress" title={`${s.planned} planned · ${s.booked} booked · ${s.shipped} shipped of ${s.ordered}`}>
              <div className="db-progress-bar"><span className="planned" style={{ width: pct(s.planned) }} /><span className="booked" style={{ width: pct(s.booked) }} /><span className="shipped" style={{ width: pct(s.shipped) }} /></div>
              <small>{s.ordered} ctns · {s.planned} planned · {s.shipped} shipped</small>
            </div></td>
            <td>{s.forecastOnSite ? formatDate(s.forecastOnSite) : <span className="db-muted">Not planned</span>}</td>
            <td>{formatDate(s.job.required_onsite_date)}</td>
            <td><span className={`risk ${s.timing === "Late" ? "delayed" : s.timing === "Within target" ? "on-track" : "not-planned"}`}>{s.timing === "Late" ? `${s.worstLateDays} days late` : s.timing === "Within target" ? (margin !== null && margin > 0 ? `${margin} days early` : "On time") : "Not planned"}</span></td>
          </tr>;
        })}
      </tbody></table></div>
      <p className="db-legend"><span className="db-key planned" /> Planned <span className="db-key booked" /> Freight booked <span className="db-key shipped" /> Shipped</p>
    </section>

    <section className="db-grid">
      <article className="dash-panel db-attention">
        <div className="all-jobs-title"><div><h2>Needs attention{ready && attention.length > 0 && <span className="db-count">{attention.length}</span>}</h2><p>Worked out from the live production, freight and capacity data.</p></div></div>
        {!ready ? <div className="empty">Checking orders…</div> : attention.length === 0 ? <div className="db-all-clear">✓ Nothing needs attention right now.</div> :
          <ul className="db-attention-list">
            {attention.map(item => <li key={item.id} className={item.severity}>
              <span className={`db-severity ${item.severity}`}>{severityLabel[item.severity]}</span>
              <div><strong>{item.title}</strong><small>{item.category} · {item.detail}</small></div>
              <Link href={item.href}>Open →</Link>
            </li>)}
          </ul>}
      </article>

      <article className="dash-panel db-pipeline">
        <h2>Container pipeline</h2>
        <p className="db-panel-note">All orders: ordered → planned in production → freight booked → shipped.</p>
        {([["Ordered", totals.ordered, "On all jobs"], ["Planned in production", totals.planned, `${totals.toPlan} still to plan`], ["Freight booked", totals.booked, `${totals.toBook} planned but not booked`], ["Shipped", totals.shipped, "Dispatched, in transit or completed"]] as const).map(([label, value, note]) =>
          <div className="db-pipe-row" key={label}>
            <div className="db-pipe-label"><span>{label}</span><small>{show(note)}</small></div>
            <div className="db-pipe-bar"><span style={{ width: `${totals.ordered ? Math.min(100, value / totals.ordered * 100) : 0}%` }} /></div>
            <strong>{show(value)}</strong>
          </div>)}
        <Link className="db-panel-link" href="/freight">Open freight planning →</Link>
      </article>
    </section>
  </AppShell>;
}
