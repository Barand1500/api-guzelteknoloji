/** Firma lisans yardımcıları (kalıcı veri MySQL). */

export function licenseDaysLeft(iso: string): number {
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}

export function licenseBadge(iso: string): { label: string; tone: "ok" | "warn" | "bad" | "none" } {
  if (!iso) return { label: "Tanımlanmamış", tone: "none" };
  const days = licenseDaysLeft(iso);
  if (!Number.isFinite(days)) return { label: "Tanımlanmamış", tone: "none" };
  if (days < 0) return { label: "Süresi dolmuş", tone: "bad" };
  if (days < 30) return { label: `${days} gün kaldı`, tone: "warn" };
  return { label: `${days} gün kaldı`, tone: "ok" };
}
