/** Firmalar — tenant kayıtları (localStorage; API sonrası). */

export type CompanyRow = {
  id: string;
  name: string;
  active: boolean;
  domain: string;
  domainActive: boolean;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbActive: boolean;
  frontendPath: string;
  /** ISO tarih — lisans bitiş */
  licenseEndsAt: string;
};

const STORAGE_KEY = "gtk_tahsilat_companies_v1";

const SAMPLE: CompanyRow[] = [
  {
    id: "co-demo",
    name: "Demo Anypay",
    active: true,
    domain: "demo.anypay.com.tr",
    domainActive: true,
    dbHost: "127.0.0.1",
    dbPort: "3306",
    dbName: "anypay_demo",
    dbUser: "anypay",
    dbPassword: "",
    dbActive: true,
    frontendPath: "/home/anypay-demo/htdocs/demo.anypay.com.tr",
    licenseEndsAt: new Date(Date.now() + 219 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function normalize(rows: Partial<CompanyRow>[]): CompanyRow[] {
  return rows
    .map((r, i) => ({
      id: String(r.id || `co-${i}`),
      name: String(r.name || "").trim(),
      active: r.active !== false,
      domain: String(r.domain || "").trim(),
      domainActive: r.domainActive !== false,
      dbHost: String(r.dbHost || "").trim(),
      dbPort: String(r.dbPort || "3306").trim(),
      dbName: String(r.dbName || "").trim(),
      dbUser: String(r.dbUser || "").trim(),
      dbPassword: String(r.dbPassword || ""),
      dbActive: r.dbActive !== false,
      frontendPath: String(r.frontendPath || "").trim(),
      licenseEndsAt: String(r.licenseEndsAt || new Date().toISOString()),
    }))
    .filter((r) => r.name && r.domain);
}

export function loadCompanies(): CompanyRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return normalize(raw as Partial<CompanyRow>[]);
  } catch {
    /* örnek */
  }
  return SAMPLE.map((r) => ({ ...r }));
}

export function saveCompanies(rows: CompanyRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function newCompanyId() {
  return `co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function licenseDaysLeft(iso: string): number {
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}

export function licenseBadge(iso: string): { label: string; tone: "ok" | "warn" | "bad" | "none" } {
  const days = licenseDaysLeft(iso);
  if (!Number.isFinite(days)) return { label: "Tanımlanmamış", tone: "none" };
  if (days < 0) return { label: "Süresi dolmuş", tone: "bad" };
  if (days < 30) return { label: `${days} gün kaldı`, tone: "warn" };
  return { label: `${days} gün kaldı`, tone: "ok" };
}
