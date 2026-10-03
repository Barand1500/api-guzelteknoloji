import type { View } from "./types";

export function Field({
  label,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" required {...props} />
    </div>
  );
}
export function Logo() {
  return (
    <div className="logo">
      Güzel <i>Teknoloji</i>
    </div>
  );
}
export function Nav({
  id,
  view,
  set,
  icon,
  label,
  extra = "",
}: {
  id: View;
  view: View;
  set: (v: View) => void;
  icon: string;
  label: string;
  extra?: string;
}) {
  return (
    <button
      className={(view === id ? "active " : "") + extra}
      onClick={() => set(id)}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
export function Loading() {
  return <div className="empty">Yükleniyor…</div>;
}
