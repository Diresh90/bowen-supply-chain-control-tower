import { AppShell } from "@/components/app-shell";

export function ProtectedPlaceholder({ title }: { title: string }) {
  return <AppShell><section className="placeholder-page"><span className="eyebrow">BOWEN CONTROL TOWER</span><h1>{title}</h1><p>This secured module is ready for its next operational phase.</p></section></AppShell>;
}
