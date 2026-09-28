import { AppShell } from "@/components/app-shell";

export default function ProductionPage() {
  return (
    <AppShell>
      <header className="page-header">
        <div>
          <p className="eyebrow">SUPPLIER PLANNING</p>
          <h1>Production</h1>
          <p>Production planning, stages, and capacity will be introduced in the next workflow steps.</p>
        </div>
      </header>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Production planning</h2>
            <p>This workspace is ready for the supplier-based production workflow.</p>
          </div>
        </div>
        <div className="empty">
          <strong>Production setup is coming next</strong>
          <span>No procurement or supplier records have been changed.</span>
        </div>
      </section>
    </AppShell>
  );
}
