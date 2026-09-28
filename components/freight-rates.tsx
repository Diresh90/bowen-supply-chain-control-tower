"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FreightRate } from "@/lib/database.types";
import { supabaseRequest } from "@/lib/supabase";

type CurrencyView = "USD" | "AUD";
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const originNames: Record<string, string> = { CNNJG: "Nanjing, China", CNSHA: "Shanghai, China", NSA: "Nhava Sheva / JNPT, India" };
const money = (value: number, currency: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const rateValue = (rate: FreightRate, view: CurrencyView) => view === "USD" ? Number(rate.sea_freight_rate_original) : rate.sea_freight_rate_aud === null ? null : Number(rate.sea_freight_rate_aud);
const labelForLocation = (rate: FreightRate, side: "origin" | "destination") => rate[side]?.name || (side === "origin" ? originNames[rate.origin_code] : null) || "—";

export function FreightRates() {
  const [rates, setRates] = useState<FreightRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CurrencyView>("USD");
  const [year, setYear] = useState("all"), [origin, setOrigin] = useState("all"), [destination, setDestination] = useState("all"), [container, setContainer] = useState("all"), [currency, setCurrency] = useState("all");
  const [chartOrigin, setChartOrigin] = useState("CNNJG"), [comparisonYear, setComparisonYear] = useState("2026");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const rows = await supabaseRequest<FreightRate[]>("freight_rates?select=*,origin:locations!freight_rates_origin_location_id_fkey(*),destination:locations!freight_rates_destination_location_id_fkey(*),freight_forwarders(*)&order=rate_month.desc,origin_code.asc");
      setRates(rows);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const values = (key: (rate: FreightRate) => string) => [...new Set(rates.map(key).filter(value => value && value !== "—"))].sort();
  const years = values(rate => rate.rate_month.slice(0, 4));
  const origins = values(rate => rate.origin_code);
  const destinations = values(rate => labelForLocation(rate, "destination"));
  const containers = values(rate => rate.container_type || "—");
  const currencies = values(rate => rate.original_currency);
  const filtered = rates.filter(rate => (year === "all" || rate.rate_month.startsWith(year)) && (origin === "all" || rate.origin_code === origin) && (destination === "all" || labelForLocation(rate, "destination") === destination) && (container === "all" || rate.container_type === container) && (currency === "all" || rate.original_currency === currency));

  const chartRates = useMemo(() => rates.filter(rate => rate.origin_code === chartOrigin), [rates, chartOrigin]);
  const currentYear = Number(comparisonYear), previousYear = currentYear - 1;
  const byMonth = (targetYear: number) => months.map((_, index) => chartRates.find(rate => Number(rate.rate_month.slice(0, 4)) === targetYear && Number(rate.rate_month.slice(5, 7)) === index + 1));
  const previous = byMonth(previousYear), current = byMonth(currentYear);
  const plotted = [...previous, ...current].map(rate => rate ? rateValue(rate, view) : null).filter((value): value is number => value !== null);
  const min = plotted.length ? Math.min(...plotted) * 0.94 : 0, max = plotted.length ? Math.max(...plotted) * 1.06 : 1;
  const points = (series: Array<FreightRate | undefined>) => series.map((rate, index) => { const value = rate ? rateValue(rate, view) : null; return value === null ? null : `${40 + index * 72},${210 - ((value - min) / Math.max(max - min, 1)) * 170}`; });
  const segments = (series: Array<FreightRate | undefined>) => { const result: string[] = []; let currentSegment: string[] = []; points(series).forEach(point => { if (point) currentSegment.push(point); else if (currentSegment.length) { result.push(currentSegment.join(" ")); currentSegment = []; } }); if (currentSegment.length) result.push(currentSegment.join(" ")); return result; };

  return <div className="freight-rates-section">
    <section className="rates-toolbar">
      <div><p className="eyebrow">HISTORICAL MARKET ANALYSIS</p><h2>Freight Rates</h2><p>Original market rates and their historical AUD cost equivalents. Live bookings remain separate.</p></div>
      <div className="currency-toggle" aria-label="Currency view">{(["USD", "AUD"] as CurrencyView[]).map(item => <button key={item} className={view === item ? "selected" : ""} onClick={() => setView(item)}>{item}</button>)}</div>
    </section>
    {error && <div className="notice error">Freight Rates could not load. Run the schema migration and historical import in Supabase, then refresh. {error}</div>}
    <section className="panel rate-chart-panel">
      <div className="panel-title"><div><h2>Monthly rate trend</h2><p>{previousYear} vs {currentYear} · {view} · missing months are not plotted</p></div><div className="chart-controls"><select aria-label="Chart origin" value={chartOrigin} onChange={event => setChartOrigin(event.target.value)}>{origins.length ? origins.map(code => <option key={code} value={code}>{originNames[code] || code}</option>) : Object.keys(originNames).map(code => <option key={code}>{code}</option>)}</select><select aria-label="Comparison year" value={comparisonYear} onChange={event => setComparisonYear(event.target.value)}>{years.filter(item => Number(item) > Math.min(...years.map(Number))).map(item => <option key={item}>{item}</option>)}{years.length < 2 && <option>2026</option>}</select></div></div>
      <div className="trend-chart"><svg viewBox="0 0 880 245" role="img" aria-label={`${previousYear} and ${currentYear} monthly freight rate chart`}><line x1="40" y1="210" x2="840" y2="210" className="chart-axis"/>{months.map((month,index)=><text key={month} x={40+index*72} y="232" textAnchor="middle">{month}</text>)}{segments(previous).map((segment,index)=><polyline key={`previous-${index}`} points={segment} className="chart-line previous"/>)}{segments(current).map((segment,index)=><polyline key={`current-${index}`} points={segment} className="chart-line current"/>)}{points(previous).map((point,index)=>point&&<circle key={`p-${index}`} cx={point.split(",")[0]} cy={point.split(",")[1]} r="4" className="chart-dot previous"/>)}{points(current).map((point,index)=>point&&<circle key={`c-${index}`} cx={point.split(",")[0]} cy={point.split(",")[1]} r="4" className="chart-dot current"/>)}</svg><div className="chart-legend"><span className="previous">{previousYear}</span><span className="current">{currentYear}</span></div></div>
    </section>
    <section className="panel yoy-panel"><div className="panel-title"><div><h2>Year-on-year comparison</h2><p>Matching months for {originNames[chartOrigin] || chartOrigin}; percentage = (current − previous) / previous.</p></div></div><div className="table-wrap"><table><thead><tr><th>Month</th><th>Previous Year Rate</th><th>Current Year Rate</th><th>Difference</th><th>Percentage Difference</th></tr></thead><tbody>{months.map((month,index)=>{const oldValue=previous[index]?rateValue(previous[index]!,view):null,newValue=current[index]?rateValue(current[index]!,view):null,difference=oldValue!==null&&newValue!==null?newValue-oldValue:null,percentage=difference!==null&&oldValue!==null&&oldValue!==0?difference/oldValue*100:null;return <tr key={month}><td>{month}</td><td>{oldValue===null?"—":money(oldValue,view)}</td><td>{newValue===null?(view==="AUD"&&current[index]?"FX Missing":"—"):money(newValue,view)}</td><td>{difference===null?"—":money(difference,view)}</td><td className={percentage!==null&&percentage<0?"rate-down":"rate-up"}>{percentage===null?"—":`${percentage.toFixed(2)}%`}</td></tr>})}</tbody></table></div></section>
    <section className="filter-panel rate-filters"><select aria-label="Filter year" value={year} onChange={e=>setYear(e.target.value)}><option value="all">All years</option>{years.map(item=><option key={item}>{item}</option>)}</select><select aria-label="Filter origin" value={origin} onChange={e=>setOrigin(e.target.value)}><option value="all">All origins</option>{origins.map(code=><option key={code} value={code}>{originNames[code] || code}</option>)}</select><select aria-label="Filter destination" value={destination} onChange={e=>setDestination(e.target.value)}><option value="all">All destinations</option>{destinations.map(item=><option key={item}>{item}</option>)}</select><select aria-label="Filter container type" value={container} onChange={e=>setContainer(e.target.value)}><option value="all">All container types</option>{containers.map(item=><option key={item}>{item}</option>)}</select><select aria-label="Filter currency" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="all">All currencies</option>{currencies.map(item=><option key={item}>{item}</option>)}</select><button className="secondary" onClick={()=>void load()}>↻ Refresh</button></section>
    <section className="panel"><div className="panel-title"><div><h2>Historical rates</h2><p>{filtered.length} record{filtered.length===1?"":"s"}; values use each month&apos;s stored FX rate.</p></div></div><div className="table-wrap"><table className="rates-table"><thead><tr><th>Month</th><th>Origin</th><th>Destination</th><th>Container Type</th><th>Original Sea Freight</th><th>Currency</th><th>FX Rate</th><th>AUD Equivalent</th><th>Local Charges AUD</th><th>Total AUD</th><th>Forwarder / Source</th><th>{view} View</th></tr></thead><tbody>{loading?<tr><td colSpan={12} className="empty">Loading historical freight rates…</td></tr>:filtered.length===0?<tr><td colSpan={12} className="empty"><strong>No historical rates found</strong><span>Adjust filters or run the supplied import.</span></td></tr>:filtered.map(rate=><tr key={rate.id}><td>{new Intl.DateTimeFormat("en-AU",{month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${rate.rate_month}T00:00:00Z`))}</td><td><strong>{labelForLocation(rate,"origin")}</strong><small>{rate.origin_code}</small></td><td>{labelForLocation(rate,"destination")}</td><td>{rate.container_type||"—"}</td><td>{money(Number(rate.sea_freight_rate_original),rate.original_currency)}</td><td>{rate.original_currency}</td><td>{rate.fx_rate_to_aud===null?"FX Missing":Number(rate.fx_rate_to_aud).toFixed(2)}</td><td>{rate.sea_freight_rate_aud===null?"FX Missing":money(Number(rate.sea_freight_rate_aud),"AUD")}</td><td>{rate.local_charges_aud===null?"—":money(Number(rate.local_charges_aud),"AUD")}</td><td>{rate.total_cost_aud===null?"FX Missing":money(Number(rate.total_cost_aud),"AUD")}</td><td>{rate.freight_forwarders?.name||rate.source_reference||"—"}</td><td><strong>{view==="USD"?money(Number(rate.sea_freight_rate_original),rate.original_currency):rate.sea_freight_rate_aud===null?"FX Missing":money(Number(rate.sea_freight_rate_aud),"AUD")}</strong></td></tr>)}</tbody></table></div></section>
  </div>;
}
