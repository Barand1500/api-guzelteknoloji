/** Coğrafi Veriler — iller (+ sonra ilçeler). */

export type ProvinceRow = {
  id: string;
  name: string;
  plateCode: string;
  active: boolean;
};

export type DistrictRow = {
  id: string;
  name: string;
  provinceId: string;
  active: boolean;
};

const PROVINCES_KEY = "gtk_tahsilat_provinces_v1";
const DISTRICTS_KEY = "gtk_tahsilat_districts_v1";

/** TR plaka örnekleri (tam liste sonradan doldurulabilir / API) */
const SAMPLE_PROVINCES: ProvinceRow[] = [
  { id: "p01", name: "Adana", plateCode: "01", active: true },
  { id: "p05", name: "Amasya", plateCode: "05", active: true },
  { id: "p06", name: "Ankara", plateCode: "06", active: true },
  { id: "p07", name: "Antalya", plateCode: "07", active: true },
  { id: "p08", name: "Artvin", plateCode: "08", active: true },
  { id: "p09", name: "Aydın", plateCode: "09", active: true },
  { id: "p10", name: "Balıkesir", plateCode: "10", active: true },
  { id: "p74", name: "Bartın", plateCode: "74", active: true },
  { id: "p72", name: "Batman", plateCode: "72", active: true },
  { id: "p69", name: "Bayburt", plateCode: "69", active: true },
  { id: "p11", name: "Bilecik", plateCode: "11", active: true },
  { id: "p12", name: "Bingöl", plateCode: "12", active: true },
  { id: "p13", name: "Bitlis", plateCode: "13", active: true },
  { id: "p75", name: "Ardahan", plateCode: "75", active: true },
  { id: "p34", name: "İstanbul", plateCode: "34", active: true },
  { id: "p35", name: "İzmir", plateCode: "35", active: true },
];

const SAMPLE_DISTRICTS: DistrictRow[] = [
  { id: "d1", name: "Aladağ", provinceId: "p01", active: true },
  { id: "d2", name: "Ceyhan", provinceId: "p01", active: true },
  { id: "d3", name: "Çukurova", provinceId: "p01", active: true },
  { id: "d4", name: "Feke", provinceId: "p01", active: true },
  { id: "d5", name: "İmamoğlu", provinceId: "p01", active: true },
  { id: "d6", name: "Karaisalı", provinceId: "p01", active: true },
  { id: "d7", name: "Karataş", provinceId: "p01", active: true },
  { id: "d8", name: "Kozan", provinceId: "p01", active: true },
  { id: "d9", name: "Pozantı", provinceId: "p01", active: true },
  { id: "d10", name: "Saimbeyli", provinceId: "p01", active: true },
];

function loadProvincesRaw(): ProvinceRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROVINCES_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      return (raw as Partial<ProvinceRow>[]).map((r, i) => ({
        id: String(r.id || `p-${i}`),
        name: String(r.name || "").trim(),
        plateCode: String(r.plateCode || "").trim(),
        active: r.active !== false,
      })).filter((r) => r.name);
    }
  } catch {
    /* örnek */
  }
  return SAMPLE_PROVINCES.map((r) => ({ ...r }));
}

export function loadProvinces(): ProvinceRow[] {
  return loadProvincesRaw().sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export function saveProvinces(rows: ProvinceRow[]) {
  localStorage.setItem(PROVINCES_KEY, JSON.stringify(rows));
}

export function listActiveProvinceNames(): string[] {
  return loadProvinces()
    .filter((p) => p.active)
    .map((p) => p.name);
}

export function loadDistricts(): DistrictRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISTRICTS_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      return (raw as Partial<DistrictRow>[]).map((r, i) => ({
        id: String(r.id || `d-${i}`),
        name: String(r.name || "").trim(),
        provinceId: String(r.provinceId || ""),
        active: r.active !== false,
      })).filter((r) => r.name && r.provinceId);
    }
  } catch {
    /* örnek */
  }
  return SAMPLE_DISTRICTS.map((r) => ({ ...r }));
}

export function provinceNameById(id: string): string {
  return loadProvinces().find((p) => p.id === id)?.name || "—";
}

export function saveDistricts(rows: DistrictRow[]) {
  localStorage.setItem(DISTRICTS_KEY, JSON.stringify(rows));
}

export function newGeoId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
