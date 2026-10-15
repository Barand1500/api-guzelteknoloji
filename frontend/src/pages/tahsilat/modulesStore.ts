/** Sistem → Modüller (localStorage; API sonrası). */

export type ModuleRow = {
  id: string;
  name: string;
  code: string;
  icon: string;
  sortOrder: number;
  parentId: string | null;
  active: boolean;
};

const STORAGE_KEY = "gtk_tahsilat_modules_v1";

const SAMPLE: ModuleRow[] = [
  { id: "mod-ozet", name: "Özet", code: "ozet", icon: "LayoutDashboard", sortOrder: 1, parentId: null, active: true },
  { id: "mod-hizli", name: "Hızlı Ödeme", code: "hizli_odeme", icon: "Zap", sortOrder: 2, parentId: null, active: true },
  { id: "mod-raporlar", name: "Raporlar", code: "raporlar", icon: "BarChart3", sortOrder: 3, parentId: null, active: true },
  { id: "mod-istatistik", name: "İstatistikler", code: "raporlar_istatistikler", icon: "BarChart3", sortOrder: 1, parentId: "mod-raporlar", active: true },
  { id: "mod-tahsilat-rapor", name: "Tahsilat Raporu", code: "tahsilat_raporu", icon: "FileBarChart", sortOrder: 2, parentId: "mod-raporlar", active: true },
  { id: "mod-tanim", name: "Tanımlamalar", code: "tanimlamalar", icon: "List", sortOrder: 4, parentId: null, active: true },
  { id: "mod-cari", name: "Cari Tipleri", code: "cari_tipleri", icon: "Tags", sortOrder: 1, parentId: "mod-tanim", active: true },
  { id: "mod-iletisim", name: "İletişim Bilgileri", code: "iletisim_bilgileri", icon: "Phone", sortOrder: 2, parentId: "mod-tanim", active: true },
  { id: "mod-sanal-pos", name: "Sanal pos ve anlaşmalar", code: "sanal_pos_anlasmalar", icon: "CreditCard", sortOrder: 5, parentId: null, active: true },
  { id: "mod-sanal-tanim", name: "Sanal Pos Tanımları", code: "sanal_pos_tanimlari", icon: "Cpu", sortOrder: 1, parentId: "mod-sanal-pos", active: true },
  { id: "mod-ortak-sanal", name: "Ortak Sanal Pos Tanımları", code: "ortak_sanal_pos", icon: "Share2", sortOrder: 2, parentId: "mod-sanal-pos", active: true },
  { id: "mod-banka-kart", name: "Banka Kart Anlaşmaları", code: "banka_kart_anlasmalari", icon: "Landmark", sortOrder: 3, parentId: "mod-sanal-pos", active: true },
  { id: "mod-ayarlar", name: "Ayarlar", code: "ayarlar", icon: "Settings", sortOrder: 6, parentId: null, active: true },
  { id: "mod-genel-ayar", name: "Genel Ayarlar", code: "genel_ayarlar", icon: "Settings", sortOrder: 1, parentId: "mod-ayarlar", active: true },
  { id: "mod-musteri", name: "Müşteri Kullanıcıları", code: "musteri_kullanicilari", icon: "Users", sortOrder: 7, parentId: null, active: true },
];

function normalize(rows: Partial<ModuleRow>[]): ModuleRow[] {
  return rows
    .map((r, i) => ({
      id: String(r.id || `mod-${i}`),
      name: String(r.name || "").trim(),
      code: String(r.code || "").trim(),
      icon: String(r.icon || "").trim(),
      sortOrder: Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : 0,
      parentId: r.parentId ? String(r.parentId) : null,
      active: r.active !== false,
    }))
    .filter((r) => r.name && r.code);
}

export function loadModules(): ModuleRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return normalize(raw as Partial<ModuleRow>[]);
  } catch {
    /* örnek */
  }
  return SAMPLE.map((r) => ({ ...r }));
}

export function saveModules(rows: ModuleRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function newModuleId() {
  return `mod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function moduleNameById(id: string | null, rows?: ModuleRow[]): string {
  if (!id) return "";
  const list = rows || loadModules();
  return list.find((m) => m.id === id)?.name || "";
}

/** Kod: küçük harf, boşluk → alt çizgi */
export function slugifyCode(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
