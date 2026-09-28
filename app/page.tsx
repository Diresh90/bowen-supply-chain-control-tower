import { AppShell } from "@/components/app-shell";

const jobs = [
  ["Vanderlande NSW", "Craftsman Automation", "POS00247", "In Production", "28 Jul 2024", "At Risk", "Confirm booking date", "Diresh"],
  ["Sydney Install", "Nanjing Power Gear", "POS00251", "In Transit", "05 Aug 2024", "On Track", "Track vessel", "Diresh"],
  ["Brisbane Stock", "Craftsman Automation", "POS00260", "Awaiting QC", "18 Jul 2024", "Delayed", "Follow up failed inspection", "Diresh"],
  ["Melbourne Replenishment", "Local Supplier", "POS00263", "Delivered", "06 Jul 2024", "On Track", "Close job", "Sarah"],
  ["Perth Project", "Chinese Manufacturer", "POS00270", "Ready to Ship", "25 Jul 2024", "At Risk", "Upload documents", "Diresh"],
  ["Adelaide Upgrade", "Local Supplier", "POS00271", "Booked", "30 Jul 2024", "On Track", "Confirm delivery window", "Sarah"],
];

const metrics = [
  ["Total Jobs", "24", "100%", "blue", "▣"], ["On Track", "14", "58.3%", "green", "◉"],
  ["At Risk", "6", "25.0%", "orange", "▧"], ["Delayed", "3", "12.5%", "red", "♧"],
  ["Delivered", "1", "4.2%", "purple", "⌁"], ["Total Value (AUD)", "$3.76M", "100%", "neutral", "$"],
];

export default function Home() {
  return <AppShell>
    <header className="dashboard-head">
      <div><h1>Freight &amp; Procurement Dashboard</h1><div className="tabs"><button className="selected">Overview</button><button>Jobs</button><button>POs</button><button>Freight</button><button>Containers</button><button>Reports</button></div></div>
      <div className="dashboard-actions"><button>▤&nbsp; Filters</button><button>01 Jul 2024 – 31 Jul 2024&nbsp; ▣</button></div>
    </header>
    <section className="dashboard-metrics">
      {metrics.map(([label, value, percent, tone, icon]) => <article className={`dashboard-metric ${tone}`} key={label}>
        <div><span>{label}</span><strong>{value}</strong><small>{percent}</small></div><div className="metric-art"><b>{icon}</b>{tone !== "neutral" && <svg viewBox="0 0 100 45" aria-hidden="true"><polyline points="0,39 12,36 22,20 33,36 45,25 56,31 68,10 79,16 89,4 100,10" /></svg>}</div>
      </article>)}
    </section>
    <section className="visual-grid">
      <article className="dash-panel status-panel"><h2>Jobs by Status</h2><div className="donut-wrap"><div className="donut"><span /></div><ul><li><i className="green-bg" />On Track <small>14 (58.3%)</small></li><li><i className="orange-bg" />At Risk <small>6 (25.0%)</small></li><li><i className="red-bg" />Delayed <small>3 (12.5%)</small></li><li><i className="purple-bg" />Delivered <small>1 (4.2%)</small></li></ul></div></article>
      <article className="dash-panel stage-panel"><h2>Jobs by Current Stage</h2><div className="bar-chart">{[[2,"New PO"],[6,"In Production"],[4,"Ready to Ship"],[3,"Booked / Loaded"],[5,"In Transit"],[2,"Customs"],[1,"Delivered"],[1,"Closed"]].map(([n,l]) => <div key={l}><span style={{height:`${Number(n)*24}px`}}><b>{n}</b></span><small>{l}</small></div>)}</div></article>
      <article className="dash-panel transit-panel"><h2>Freight in Transit</h2><div className="world-map"><span className="continent c1"/><span className="continent c2"/><span className="continent c3"/><span className="route r1"/><span className="route r2"/><b className="ship s1">▰</b><b className="ship s2">▰</b><b className="ship s3">▰</b></div><table><thead><tr><th>Vessel</th><th>From</th><th>To</th><th>ETA</th></tr></thead><tbody><tr><td>ONE Harmony</td><td>Nhava Sheva</td><td>Sydney</td><td className="eta">28 Jul</td></tr><tr><td>OOCL Singapore</td><td>Shanghai</td><td>Brisbane</td><td className="eta">02 Aug</td></tr><tr><td>Maersk Camden</td><td>Ningbo</td><td>Melbourne</td><td className="eta">05 Aug</td></tr></tbody></table></article>
    </section>
    <section className="dash-panel all-jobs"><h2>All Jobs</h2><div className="table-wrap"><table><thead><tr><th>Job Name</th><th>Supplier</th><th>PO Number</th><th>Current Stage</th><th>ETA</th><th>Risk</th><th>Next Action</th><th>Owner</th><th>Last Update</th><th /></tr></thead><tbody>{jobs.map((job, i) => <tr key={job[0]}>{job.map((cell, j) => <td key={cell}>{j === 3 ? <span className={`stage stage-${i}`}>{cell}</span> : j === 5 ? <span className={`risk ${cell.toLowerCase().replace(" ", "-")}`}>{cell}</span> : cell}</td>)}<td>18 Jul 2024</td><td>⋮</td></tr>)}</tbody></table></div></section>
  </AppShell>;
}
