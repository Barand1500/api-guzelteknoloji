/** Sistem → Şablon Değişkenleri */

export type TemplateChannel = "email" | "sms";

export type TemplateVarGroup = {
  id: string;
  name: string;
  type: TemplateChannel;
  variables: string[];
  active: boolean;
};

const STORAGE_KEY = "gtk_tahsilat_template_vars_v1";

const SAMPLE: TemplateVarGroup[] = [
  {
    id: "tv1",
    name: "Başarılı Tahsilat",
    type: "email",
    variables: [
      "id",
      "tarih",
      "musteriunvani",
      "adsoyad",
      "taksit",
      "tutar",
      "komisyon",
      "toplamtutar",
      "islemno",
      "referansno",
      "onaykodu",
    ],
    active: true,
  },
  {
    id: "tv2",
    name: "Başarılı Tahsilat",
    type: "sms",
    variables: [
      "id",
      "tarih",
      "musteriunvani",
      "adsoyad",
      "taksit",
      "tutar",
      "komisyon",
      "toplamtutar",
      "islemno",
      "referansno",
      "onaykodu",
    ],
    active: true,
  },
  {
    id: "tv3",
    name: "Dekont Gönderme",
    type: "email",
    variables: ["dekontdosyasi", "adsoyad"],
    active: true,
  },
  {
    id: "tv4",
    name: "Hatalı Tahsilat",
    type: "email",
    variables: [
      "id",
      "tarih",
      "musteriunvani",
      "adsoyad",
      "taksit",
      "tutar",
      "komisyon",
      "toplamtutar",
      "hatamesaji",
    ],
    active: true,
  },
  {
    id: "tv5",
    name: "Hatalı Tahsilat",
    type: "sms",
    variables: [
      "id",
      "tarih",
      "musteriunvani",
      "adsoyad",
      "taksit",
      "tutar",
      "komisyon",
      "toplamtutar",
      "hatamesaji",
    ],
    active: true,
  },
  {
    id: "tv6",
    name: "Kullanıcı Ekleme/Düzenleme",
    type: "email",
    variables: ["ad", "soyad", "eposta", "sifre"],
    active: true,
  },
  {
    id: "tv7",
    name: "Kullanıcı Ekleme/Düzenleme",
    type: "sms",
    variables: ["ad", "soyad", "eposta", "sifre"],
    active: true,
  },
  {
    id: "tv8",
    name: "Ödeme İsteği Gönderme",
    type: "email",
    variables: ["tutar", "aciklama", "istekno", "unvan", "odemelinki"],
    active: true,
  },
  {
    id: "tv9",
    name: "Ödeme İsteği Gönderme",
    type: "sms",
    variables: ["tutar", "aciklama", "istekno", "unvan", "odemelinki"],
    active: true,
  },
];

function cleanVarKey(raw: string): string {
  return raw
    .trim()
    .replace(/^\{\{|\}\}$/g, "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Virgül / satır / noktalı virgül — tekrarlar atılır */
export function parseVariableKeys(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;]+/)) {
    const key = cleanVarKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function normalize(rows: Partial<TemplateVarGroup>[]): TemplateVarGroup[] {
  return rows
    .map((r, i) => ({
      id: String(r.id || `tv-${i}`),
      name: String(r.name || "").trim(),
      type: r.type === "sms" ? ("sms" as const) : ("email" as const),
      variables: Array.isArray(r.variables)
        ? parseVariableKeys((r.variables as string[]).join(","))
        : parseVariableKeys(String(r.variables || "")),
      active: r.active !== false,
    }))
    .filter((r) => r.name);
}

export function loadTemplateVars(): TemplateVarGroup[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return normalize(raw as Partial<TemplateVarGroup>[]);
  } catch {
    /* örnek */
  }
  return SAMPLE.map((r) => ({ ...r, variables: [...r.variables] }));
}

export function saveTemplateVars(rows: TemplateVarGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function newTemplateVarId() {
  return `tv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function channelLabel(type: TemplateChannel): string {
  return type === "sms" ? "SMS" : "E-Posta";
}
