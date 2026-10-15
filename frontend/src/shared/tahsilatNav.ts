/** Tahsilat menü dünyası — sol navigasyon ağacı (içerik sonra) */

export type TahsilatPageId =
  | "ozet"
  | "firmalar"
  | "odeme-bankalar"
  | "odeme-bin"
  | "odeme-sanal-pos"
  | "genel-para"
  | "genel-sozlesmeler"
  | "genel-vergi"
  | "kart-tipler"
  | "kart-turler"
  | "kart-markalar"
  | "cografi-iller"
  | "cografi-ilceler"
  | "sistem-moduller"
  | "sistem-sablon"
  | "sistem-eposta"
  | "sistem-surumler";

export type TahsilatNavLeaf = {
  id: TahsilatPageId;
  label: string;
  icon: string;
};

export type TahsilatNavGroup = {
  id: string;
  label: string;
  icon: string;
  children: TahsilatNavLeaf[];
};

export type TahsilatNavItem =
  | ({ kind: "leaf" } & TahsilatNavLeaf)
  | ({ kind: "group" } & TahsilatNavGroup);

export const TAHSILAT_NAV: TahsilatNavItem[] = [
  { kind: "leaf", id: "ozet", label: "Özet", icon: "home" },
  { kind: "leaf", id: "firmalar", label: "Firmalar", icon: "shop" },
  {
    kind: "group",
    id: "odeme",
    label: "Ödeme Altyapısı",
    icon: "pay",
    children: [
      { id: "odeme-bankalar", label: "Bankalar", icon: "building" },
      { id: "odeme-bin", label: "BIN Listesi", icon: "layers" },
      { id: "odeme-sanal-pos", label: "Ana Sanal Poslar", icon: "server" },
    ],
  },
  {
    kind: "group",
    id: "genel",
    label: "Genel Tanımlar",
    icon: "book",
    children: [
      { id: "genel-para", label: "Para Birimleri", icon: "zap" },
      { id: "genel-sozlesmeler", label: "Sözleşmeler", icon: "document" },
      { id: "genel-vergi", label: "Vergi Daireleri", icon: "building" },
    ],
  },
  {
    kind: "group",
    id: "kart",
    label: "Kart Yönetimi",
    icon: "pay",
    children: [
      { id: "kart-tipler", label: "Kart Tipleri", icon: "layers" },
      { id: "kart-turler", label: "Kart Türleri", icon: "tag" },
      { id: "kart-markalar", label: "Kart Markaları", icon: "shield" },
    ],
  },
  {
    kind: "group",
    id: "cografi",
    label: "Coğrafi Veriler",
    icon: "globe",
    children: [
      { id: "cografi-iller", label: "İller", icon: "map" },
      { id: "cografi-ilceler", label: "İlçeler", icon: "users" },
    ],
  },
  {
    kind: "group",
    id: "sistem",
    label: "Sistem",
    icon: "sliders",
    children: [
      { id: "sistem-moduller", label: "Modüller", icon: "boxes" },
      { id: "sistem-sablon", label: "Şablon Değişkenleri", icon: "code" },
      { id: "sistem-eposta", label: "E-Posta Ayarları", icon: "cloud" },
      { id: "sistem-surumler", label: "Sürümler", icon: "calendar" },
    ],
  },
];

export function tahsilatPageLabel(id: TahsilatPageId): string {
  for (const item of TAHSILAT_NAV) {
    if (item.kind === "leaf" && item.id === id) return item.label;
    if (item.kind === "group") {
      const hit = item.children.find((c) => c.id === id);
      if (hit) return hit.label;
    }
  }
  return id;
}

export function groupIdForPage(id: TahsilatPageId): string | null {
  for (const item of TAHSILAT_NAV) {
    if (item.kind === "group" && item.children.some((c) => c.id === id)) return item.id;
  }
  return null;
}

export function isTahsilatPageId(value: string): value is TahsilatPageId {
  return TAHSILAT_NAV.some((item) =>
    item.kind === "leaf" ? item.id === value : item.children.some((c) => c.id === value),
  );
}
