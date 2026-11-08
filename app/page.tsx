"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { FreightRate, OrderType, ProcurementJob, ProductionStage, Supplier, SupplierCapacityOverride } from "@/lib/database.types";
import { AttentionItem, Severity, STANDARD_WEEKS, attentionItems, capacityRows, daysBetween, estimateNewOrder, formatDate, jobLabel, summariseJobs } from "@/lib/dashboard";
import { capacityMonth, dateKey, mondayOf } from "@/lib/production";
import { jobStatuses, stageStatusOf, statusClass, statusColours } from "@/lib/jobs";
import { RATE_LANES, type RateLane, type RatePoint, historicalRates, rateTrend } from "@/lib/freight";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const severityLabel: Record<Severity, string> = { high: "Act now", medium: "Check", low: "Follow up" };
const ARRIVING_DAYS = 30;
const CHART_MONTHS = 6;

export default function Home() {
  const [jobs, setJobs] = useState<ProcurementJob[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [capacities, setCapacities] = useState<SupplierCapacityOverride[]>([]);
  const [rateHistory, setRateHistory] = useState<RatePoint[]>([]);
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
    ]);
    const capacityData = Promise.all([
      supabaseRequest<Supplier[]>("suppliers?select=*&active=eq.true&order=name.asc"),
      supabaseRequest<SupplierCapacityOverride[]>("supplier_capacity_overrides?select=*"),
    ]);
    const rateData = supabaseRequest<FreightRate[]>("freight_rates?select=*,destination:locations!freight_rates_destination_location_id_fkey(*)&origin_code=in.(NSA,CNSHA)&order=rate_month.asc");
    const [coreResult, capacityResult, rateResult] = await Promise.allSettled([coreData, capacityData, rateData]);
    setRateHistory(rateResult.status === "fulfilled" ? historicalRates(rateResult.value) : []);
    if (coreResult.status === "fulfilled") {
      const [jobRows, stageRows] = coreResult.value;
      setJobs(jobRows); setStages(stageRows);
    } else setMessage((coreResult.reason as Error).message);
    if (capacityResult.status === "fulfilled") {
      const [supplierRows, capacityRowsData] = capacityResult.value;
      setSuppliers(supplierRows); setCapacities(capacityRowsData); setCapacityAvailable(true);
    } else { setSuppliers([]); setCapacities([]); setCapacityAvailable(false); }
    setLoadedAt(new Date()); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const today = useMemo(() => (loadedAt ?? new Date()).toISOString().slice(0, 10), [loadedAt]);
  const summaries = useMemo(() => summariseJobs(jobs, stages), [jobs, stages]);
  const capacity = useMemo(() => capacityRows(suppliers, capacities, stages, 12), [suppliers, capacities, stages]);
  const attention = useMemo(() => attentionItems(summaries, capacity.map(row => ({ ...row, months: row.months.slice(0, 3) })), today), [summaries, capacity, today]);
  const attentionByJob = useMemo(() => attention.reduce<Record<string, AttentionItem[]>>((map, item) => { if (item.jobId) (map[item.jobId] ||= []).push(item); return map; }, {}), [attention]);
  const ready = !(loading && !loadedAt);
  const show = (value: number | string) => (ready ? value : "—");

  // Headline numbers
  const openOrders = summaries.filter(s => s.status !== "Fully Dispatched");
  const lateOrders = summaries.filter(s => s.timing === "Late" && s.arrived < s.ordered);
  const arrivingLimit = new Date(Date.parse(`${today}T00:00:00Z`) + ARRIVING_DAYS * 86_400_000).toISOString().slice(0, 10);
  const arriving = stages.filter(stage => !["Tentative", "Arrived"].includes(stageStatusOf(stage)) && stage.forecast_site_eta >= today && stage.forecast_site_eta <= arrivingLimit);
  const arrivingOrders = new Set(arriving.map(stage => stage.procurement_job_id)).size;

  // Capacity chart and new-order estimate
  const capacityRow = capacity.find(row => row.supplier.id === capacitySupplierId) ?? capacity[0];
  const chartMonths = capacityRow?.months.slice(0, CHART_MONTHS) ?? [];
  const chartMax = Math.max(1, ...chartMonths.map(m => Math.max(m.capacity ?? 0, m.planned)));
  // Months a new order could still use: from next month onward.
  const freeSoon = capacityRow?.months.slice(1, 4) ?? [];
  const quoteQty = Math.max(1, Math.round(Number(quoteContainers) || 1));
  const estimate = estimateNewOrder(capacityRow, quoteQty, today);

  // Rate trend: the last 12 months and the next 2.
  const monthKey = (offset: number) => { const d = new Date(`${today}T00:00:00Z`); return capacityMonth(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))); };
  const trendMonths = [-11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2].map(monthKey);
  const trend = rateTrend(stages, rateHistory).filter(point => trendMonths.includes(point.month));

  // Orders table
  const managers = [...new Set(jobs.map(job => job.project_manager).filter((m): m is string => !!m))].sort();
  const statusCounts = jobStatuses.map(status => ({ status, count: summaries.filter(s => s.status === status && (typeFilter === "all" || s.orderType === typeFilter)).length }));
  const query = search.trim().toLowerCase();
  const tableRows = summaries
    .filter(s => typeFilter === "all" || s.orderType === typeFilter)
    .filter(s => statusFilter === "all" || (statusFilter === "open" ? s.status !== "Fully Dispatched" : s.status === statusFilter))
    .filter(s => managerFilter === "all" || s.job.project_manager === managerFilter)
    .filter(s => !query || [s.job.sales_order_number, s.job.client_name, s.job.supplier_po_number, s.job.project_manager, s.job.suppliers?.name].join(" ").toLowerCase().includes(query))
    .sort((a, b) => (a.forecastOnSite ?? a.job.required_onsite_date ?? "9999").localeCompare(b.forecastOnSite ?? b.job.required_onsite_date ?? "9999"));

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

    <section className="dash-panel db-fit">
      <div className="db-fit-ask">
        <span>Can we fit</span>
        <input aria-label="Containers" type="number" min="1" step="1" value={quoteContainers} onChange={e => setQuoteContainers(e.target.value)} />
        <span>containers{capacity.length > 1 ? " at" : "?"}</span>
        {capacity.length > 1 && <><select aria-label="Supplier" value={capacityRow?.supplier.id} onChange={e => setCapacitySupplierId(e.target.value)}>{capacity.map(row => <option key={row.supplier.id} value={row.supplier.id}>{row.supplier.name}</option>)}</select><span>?</span></>}
      </div>
      {!ready ? <div className="db-fit-answer">Checking capacity…</div> : estimate.etd === null
        ? <div className="db-fit-answer no"><strong>Not in a single month</strong><span>{estimate.reason} Try fewer containers, or split the order across months.</span></div>
        : <div className="db-fit-answer yes">
          <strong>Yes · dispatches {estimate.month} (W/C {formatDate(dateKey(mondayOf(new Date(`${estimate.dispatch}T00:00:00Z`))))}), sails about {formatDate(estimate.etd)}</strong>
          <span>Earliest on site <b>{formatDate(estimate.onSite)}</b> · {estimate.free - quoteQty} containers left in {estimate.month} after this order</span>
        </div>}
      <small className="db-fit-basis">Uses the capacity and planned stages from Production. Lead time {STANDARD_WEEKS.production} wks production + {STANDARD_WEEKS.dispatch} wks loading and origin transport, then {STANDARD_WEEKS.transit} wks sea + {STANDARD_WEEKS.delivery} wk delivery. Confirm with production before quoting.</small>
    </section>

    <section className="dash-panel db-capacity db-capacity-full">
        <div className="db-panel-head"><div><h2>Capacity outlook</h2><p>Containers planned against monthly capacity, by planned dispatch month (tentative included).</p></div>
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
    </section>

    <section className="dash-panel db-rates db-rates-full">
      <h2>40ft sea freight rates into Melbourne</h2>
      <p className="db-panel-note">USD per 40ft container, all-in sea freight. Solid points are rates you entered on the Dispatch Plan; hollow points are imported market history.</p>
      {!ready ? <div className="empty">Loading…</div> : trend.length === 0 ? <div className="db-freight-empty">No rates yet. Import market history or enter ocean freight on stages to start the trend.</div> : <RateChart months={trendMonths} points={trend} />}
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
      <div className="table-wrap"><table><thead><tr><th>Job / sales order</th><th>Type</th><th>Project manager</th><th>Status</th><th>Current stage</th><th>Progress</th><th>Forecast on site</th><th>Required on site</th><th>Timing</th></tr></thead><tbody>
        {!ready ? <tr><td colSpan={9} className="empty">Loading live order data…</td></tr> : tableRows.length === 0 ? <tr><td colSpan={9} className="empty"><strong>No orders match these filters</strong><span>Try another status, type or search.</span></td></tr> : tableRows.map(s => {
          const flags = attentionByJob[s.job.id] || [];
          const details = [jobLabel(s.job) !== s.job.client_name ? s.job.client_name : null, s.job.supplier_po_number && s.job.supplier_po_number.toUpperCase() !== "NA" ? `PO ${s.job.supplier_po_number}` : null, s.job.suppliers?.name].filter(Boolean).join(" · ");
          const pct = (n: number) => `${s.ordered ? Math.min(100, n / s.ordered * 100) : 0}%`;
          const margin = s.forecastOnSite && s.job.required_onsite_date ? daysBetween(s.forecastOnSite, s.job.required_onsite_date) : null;
          return <tr key={s.job.id}>
            <td><strong>{flags.length > 0 && <span className={`db-flag ${flags[0].severity}`} title={flags.map(f => f.title).join("\n")}>●</span>}{jobLabel(s.job)}</strong><small>{details || "—"}</small></td>
            <td><span className={`order-type ${s.orderType.toLowerCase()}`}>{s.orderType}</span></td>
            <td>{s.job.project_manager || "—"}</td>
            <td><span className={statusClass(s.status)}>{s.status}</span></td>
            <td>{s.currentStage ?? <span className="db-muted">No stage yet</span>}</td>
            <td><div className="db-progress" title={`${s.planned} planned · ${s.dispatched} dispatched · ${s.arrived} arrived of ${s.ordered}`}>
              <div className="db-progress-bar"><span className="planned" style={{ width: pct(s.planned) }} /><span className="booked" style={{ width: pct(s.dispatched) }} /><span className="shipped" style={{ width: pct(s.arrived) }} /></div>
              <small>{s.ordered} ctns · {s.planned} planned · {s.dispatched} dispatched · {s.arrived} arrived</small>
            </div></td>
            <td>{s.forecastOnSite ? formatDate(s.forecastOnSite) : <span className="db-muted">Not planned</span>}</td>
            <td>{formatDate(s.job.required_onsite_date)}</td>
            <td><span className={`risk ${s.timing === "Late" ? "delayed" : s.timing === "Within target" ? "on-track" : "not-planned"}`}>{s.timing === "Late" ? `${s.worstLateDays} days late` : s.timing === "Within target" ? (margin !== null && margin > 0 ? `${margin} days early` : "On time") : "Not planned"}</span></td>
          </tr>;
        })}
      </tbody></table></div>
      <p className="db-legend"><span className="db-key planned" /> Planned <span className="db-key booked" /> Dispatched <span className="db-key shipped" /> Arrived · status and stage come from the Dispatch Plan</p>
    </section>

  </AppShell>;
}

const LANE_COLOURS: Record<RateLane, string> = { "Nhava Sheva → MEL": "#f0a020", "Shanghai → MEL": "#378add" };

// Line per destination port; points are monthly average USD rates per 40ft container.
function RateChart({ months, points }: { months: string[]; points: RatePoint[] }) {
  const width = 1000, height = 340, left = 56, right = 70, top = 16, bottom = 30;
  const values = points.map(p => p.rateUsd);
  const min = Math.floor(Math.min(...values) * 0.9 / 100) * 100, max = Math.ceil(Math.max(...values) * 1.1 / 100) * 100 || 100;
  const x = (month: string) => left + months.indexOf(month) * ((width - left - right) / Math.max(1, months.length - 1));
  const y = (value: number) => top + (1 - (value - min) / Math.max(1, max - min)) * (height - top - bottom);
  const label = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));
  const usd = new Intl.NumberFormat("en-AU", { style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: 0 });
  const endLabels = RATE_LANES.map(({ lane }) => {
    const line = points.filter(p => p.lane === lane).sort((a, b) => a.month.localeCompare(b.month));
    const last = line[line.length - 1];
    return last ? { lane, x: x(last.month) + 9, y: y(last.rateUsd) + 4, text: Math.round(last.rateUsd).toLocaleString("en-AU") } : null;
  }).filter((label): label is { lane: RateLane; x: number; y: number; text: string } => label !== null).sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) if (endLabels[i].y - endLabels[i - 1].y < 18) endLabels[i].y = endLabels[i - 1].y + 18;
  return <div className="db-rate-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="40ft rate trend by destination port">
      {[min, (min + max) / 2, max].map(v => <g key={v}><line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="grid" /><text x={left - 6} y={y(v) + 3} textAnchor="end">{Math.round(v).toLocaleString("en-AU")}</text></g>)}
      {months.map(m => <text key={m} x={x(m)} y={height - 8} textAnchor="middle">{label(m)}</text>)}
      {RATE_LANES.map(({ lane }) => {
        const line = points.filter(p => p.lane === lane).sort((a, b) => a.month.localeCompare(b.month));
        if (!line.length) return null;
        return <g key={lane} style={{ color: LANE_COLOURS[lane] }}>
          {line.length > 1 && <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={line.map(p => `${x(p.month)},${y(p.rateUsd)}`).join(" ")} />}
          {line.map(p => <circle key={p.month} cx={x(p.month)} cy={y(p.rateUsd)} r="4" fill={p.source === "entered" ? "currentColor" : "var(--rate-hollow, #0b1620)"} stroke="currentColor" strokeWidth="2"><title>{`${lane} · ${label(p.month)}: ${usd.format(p.rateUsd)} per 40ft · ${p.source === "entered" ? `entered (${p.containers} ctns)` : "market history"}`}</title></circle>)}
        </g>;
      })}
      {endLabels.map(label => <text key={label.lane} x={label.x} y={label.y} className="db-rate-end" fill={LANE_COLOURS[label.lane]}>{label.text}</text>)}
    </svg>
    <p className="db-legend">{RATE_LANES.map(({ lane }) => <span key={lane} className="db-rate-key"><i style={{ background: LANE_COLOURS[lane] }} />{lane}</span>)}</p>
  </div>;
}
