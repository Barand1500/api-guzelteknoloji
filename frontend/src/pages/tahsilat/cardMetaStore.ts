/**
 * Kart Yönetimi listeleri — BIN dropdown’ları buradan okur.
 * tip / tür / marka sayfaları aynı depoyu yazar.
 */

export type NamedMetaRow = { id: string; name: string };
export type BrandMetaRow = { id: string; name: string; logoDataUrl: string };

const KEYS = {
  types: "gtk_tahsilat_card_types_v1",
  kinds: "gtk_tahsilat_card_kinds_v1",
  brands: "gtk_tahsilat_card_brands_v1",
} as const;

const SAMPLE_TYPES: NamedMetaRow[] = [
  { id: "ct1", name: "Banka Kartı" },
  { id: "ct2", name: "Kredi Kartı" },
  { id: "ct3", name: "Ön Ödemeli Kart" },
];

const SAMPLE_KINDS: NamedMetaRow[] = [
  { id: "ck1", name: "Bireysel Kart" },
  { id: "ck2", name: "Ticari Kart" },
];

const SAMPLE_BRANDS: BrandMetaRow[] = [
  { id: "cb1", name: "Amex", logoDataUrl: "" },
  { id: "cb2", name: "Diners", logoDataUrl: "" },
  { id: "cb3", name: "JCB", logoDataUrl: "" },
  { id: "cb4", name: "MasterCard", logoDataUrl: "" },
  { id: "cb5", name: "Özel Logolu", logoDataUrl: "" },
  { id: "cb6", name: "TROY", logoDataUrl: "" },
  { id: "cb7", name: "UnionPay", logoDataUrl: "" },
  { id: "cb8", name: "VISA", logoDataUrl: "" },
];

function load(key: string, sample: NamedMetaRow[]): NamedMetaRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (Array.isArray(raw) && raw.length) return raw as NamedMetaRow[];
  } catch {
    /* örnek */
  }
  return sample.map((r) => ({ ...r }));
}

function save(key: string, rows: NamedMetaRow[]) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function names(rows: NamedMetaRow[]) {
  return [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "tr"),
  );
}

export function loadCardTypes() {
  return load(KEYS.types, SAMPLE_TYPES);
}
export function saveCardTypes(rows: NamedMetaRow[]) {
  save(KEYS.types, rows);
}
export function listCardTypeNames() {
  return names(loadCardTypes());
}

export function loadCardKinds() {
  return load(KEYS.kinds, SAMPLE_KINDS);
}
export function saveCardKinds(rows: NamedMetaRow[]) {
  save(KEYS.kinds, rows);
}
export function listCardKindNames() {
  return names(loadCardKinds());
}

export function loadCardBrands(): BrandMetaRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS.brands) || "null");
    if (Array.isArray(raw) && raw.length) {
      return (raw as Partial<BrandMetaRow>[]).map((r, i) => ({
        id: String(r.id || `cb-${i}`),
        name: String(r.name || "").trim(),
        logoDataUrl: typeof r.logoDataUrl === "string" ? r.logoDataUrl : "",
      })).filter((r) => r.name);
    }
  } catch {
    /* örnek */
  }
  return SAMPLE_BRANDS.map((r) => ({ ...r }));
}
export function saveCardBrands(rows: BrandMetaRow[]) {
  localStorage.setItem(KEYS.brands, JSON.stringify(rows));
}
export function listCardBrandNames() {
  return names(loadCardBrands());
}

export function newMetaId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
