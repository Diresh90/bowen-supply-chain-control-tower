export function Notice({ message, kind = "error" }: { message: string; kind?: "error" | "success" }) {
  return <div className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>{message}</div>;
}
