"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { OrderType, ProcurementJob, ProductionStage, Supplier, SupplierCapacityOverride } from "@/lib/database.types";
import { AttentionItem, Severity, STANDARD_WEEKS, attentionItems, capacityRows, daysBetween, estimateNewOrder, formatDate, jobLabel, summariseJobs } from "@/lib/dashboard";
import { capacityMonth, dateKey, mondayOf } from "@/lib/production";
import { jobStatuses, stageStatusOf, statusClass, statusColours } from "@/lib/jobs";
import { DESTINATION_PORTS, ORIGIN_PORT, rateTrend, spendByMonth } from "@/lib/freight";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const severityLabel: Record<Severity, string> = { high: "Act now", medium: "Check", low: "Follow up" };
const ARRIVING_DAYS = 30;
const CHART_MONTHS = 6;

export default function Home() {
  const [jobs, setJobs] = useState<ProcurementJob[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
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
    ]);
    const capacityData = Promise.all([
      supabaseRequest<Supplier[]>("suppliers?select=*&active=eq.true&order=name.asc"),
      supabaseRequest<SupplierCapacityOverride[]>("supplier_capacity_overrides?select=*"),
    ]);
    const [coreResult, capacityResult] = await Promise.allSettled([coreData, capacityData]);
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

  // Freight: spend for 3 months back to 2 ahead; rate trend over the last 6 months and next 2.
  const monthKey = (offset: number) => { const d = new Date(`${today}T00:00:00Z`); return capacityMonth(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))); };
  const spendMonths = spendByMonth(stages.map(stage => ({ ...stage, isTentative: stageStatusOf(stage) === "Tentative" })), [-3, -2, -1, 0, 1, 2].map(monthKey));
  const spendMax = Math.max(1, ...spendMonths.map(m => m.totalAud));
  const missingFx = spendMonths.reduce((n, m) => n + m.missingFx, 0);
  const trendMonths = [-5, -4, -3, -2, -1, 0, 1, 2].map(monthKey);
  const trend = rateTrend(stages).filter(point => trendMonths.includes(point.month));
  const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

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

  const totals = summaries.reduce((t, s) => ({ ordered: t.ordered + s.ordered, planned: t.planned + s.planned, dispatched: t.dispatched + s.dispatched, arrived: t.arrived + s.arrived, toPlan: t.toPlan + s.toPlan }), { ordered: 0, planned: 0, dispatched: 0, arrived: 0, toPlan: 0 });

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

    <section className="db-grid db-freight">
      <article className="dash-panel db-spend">
        <h2>Freight spend by month</h2>
        <p className="db-panel-note">AUD by planned dispatch month: ocean freight and surcharges (converted from USD) plus local charges.</p>
        {!ready ? <div className="empty">Loading…</div> : spendMonths.every(m => m.totalAud === 0) ? <div className="db-freight-empty">No freight entered yet. Add it to stages on the Dispatch Plan.</div> : <div className="db-spend-chart">
          {spendMonths.map(m => <div className="db-spend-col" key={m.month} title={`${m.label}: ${aud.format(m.totalAud)} across ${m.stages} stage${m.stages === 1 ? "" : "s"}${m.tentativeAud ? ` (${aud.format(m.tentativeAud)} tentative)` : ""}`}>
            <span className="db-spend-value">{m.totalAud ? `${aud.format(Math.round(m.totalAud / 100) / 10)}k` : ""}</span>
            <div className="db-spend-track"><span className="confirmed" style={{ height: `${(m.totalAud - m.tentativeAud) / spendMax * 100}%` }} /><span className="tentative" style={{ height: `${m.tentativeAud / spendMax * 100}%` }} /></div>
            <span className={`db-cap-month${m.month === monthKey(0) ? " now" : ""}`}>{m.label}</span>
          </div>)}
        </div>}
        {missingFx > 0 && <p className="db-freight-warning">{missingFx} stage{missingFx === 1 ? " has" : "s have"} USD charges but no USD → AUD rate, so {missingFx === 1 ? "it isn't" : "they aren't"} counted.</p>}
        <p className="db-legend"><span className="db-key spend" /> Confirmed / dispatched <span className="db-key spend-tentative" /> Tentative</p>
      </article>

      <article className="dash-panel db-rates">
        <h2>40ft rate trend · {ORIGIN_PORT}</h2>
        <p className="db-panel-note">USD per container (ocean freight + peak season + other surcharges), averaged by dispatch month.</p>
        {!ready ? <div className="empty">Loading…</div> : trend.length === 0 ? <div className="db-freight-empty">No rates yet. Enter ocean freight on stages to start the trend.</div> : <RateChart months={trendMonths} points={trend} />}
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

    <section className="db-grid">
      <article className="dash-panel db-attention">
        <div className="all-jobs-title"><div><h2>Needs attention{ready && attention.length > 0 && <span className="db-count">{attention.length}</span>}</h2><p>Worked out from the Dispatch Plan and capacity.</p></div></div>
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
        <p className="db-panel-note">All orders: ordered → planned (confirmed stages) → dispatched → arrived on site.</p>
        {([["Ordered", totals.ordered, "On all jobs"], ["Planned", totals.planned, `${totals.toPlan} still to plan`], ["Dispatched", totals.dispatched, "Left the supplier, sailed or arrived"], ["Arrived", totals.arrived, "On site"]] as const).map(([label, value, note]) =>
          <div className="db-pipe-row" key={label}>
            <div className="db-pipe-label"><span>{label}</span><small>{show(note)}</small></div>
            <div className="db-pipe-bar"><span style={{ width: `${totals.ordered ? Math.min(100, value / totals.ordered * 100) : 0}%` }} /></div>
            <strong>{show(value)}</strong>
          </div>)}
        <Link className="db-panel-link" href="/production">Open the Dispatch Plan →</Link>
      </article>
    </section>
  </AppShell>;
}

const PORT_COLOURS: Record<string, string> = { Brisbane: "#378add", Sydney: "#1d9e75", Melbourne: "#d85a30" };

// Line per destination port; points are monthly average USD rates per 40ft container.
function RateChart({ months, points }: { months: string[]; points: { month: string; port: string; rateUsd: number; containers: number }[] }) {
  const width = 520, height = 170, left = 46, right = 12, top = 12, bottom = 26;
  const values = points.map(p => p.rateUsd);
  const min = Math.floor(Math.min(...values) * 0.9 / 100) * 100, max = Math.ceil(Math.max(...values) * 1.1 / 100) * 100 || 100;
  const x = (month: string) => left + months.indexOf(month) * ((width - left - right) / Math.max(1, months.length - 1));
  const y = (value: number) => top + (1 - (value - min) / Math.max(1, max - min)) * (height - top - bottom);
  const label = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));
  const usd = new Intl.NumberFormat("en-AU", { style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: 0 });
  return <div className="db-rate-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="40ft rate trend by destination port">
      {[min, (min + max) / 2, max].map(v => <g key={v}><line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="grid" /><text x={left - 6} y={y(v) + 3} textAnchor="end">{Math.round(v).toLocaleString("en-AU")}</text></g>)}
      {months.map(m => <text key={m} x={x(m)} y={height - 8} textAnchor="middle">{label(m)}</text>)}
      {DESTINATION_PORTS.map(port => {
        const line = points.filter(p => p.port === port).sort((a, b) => a.month.localeCompare(b.month));
        if (!line.length) return null;
        return <g key={port} style={{ color: PORT_COLOURS[port] }}>
          {line.length > 1 && <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={line.map(p => `${x(p.month)},${y(p.rateUsd)}`).join(" ")} />}
          {line.map(p => <circle key={p.month} cx={x(p.month)} cy={y(p.rateUsd)} r="4" fill="currentColor"><title>{`${port} · ${label(p.month)}: ${usd.format(p.rateUsd)} per 40ft (${p.containers} ctns)`}</title></circle>)}
        </g>;
      })}
    </svg>
    <p className="db-legend">{DESTINATION_PORTS.map(port => <span key={port} className="db-rate-key"><i style={{ background: PORT_COLOURS[port] }} />{port}</span>)}</p>
  </div>;
}
