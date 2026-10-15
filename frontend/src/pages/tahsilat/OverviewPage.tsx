import { useMemo } from "react";
import {
  Building2,
  CreditCard,
  IdCard,
  MapPinned,
  ShieldAlert,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import { loadBanks } from "./banksStore";
import { loadCardBrands, loadCardTypes } from "./cardMetaStore";
import { licenseDaysLeft, loadCompanies } from "./companiesStore";
import { loadDistricts, loadProvinces } from "./geoStore";
import "./binList.css";

type StatCard = {
  key: string;
  title: string;
  tone: "blue" | "green" | "red" | "purple" | "amber" | "teal" | "pink" | "indigo";
  icon: typeof Building2;
  left: { label: string; value: string };
  right: { label: string; value: string };
};

function formatTr(n: number) {
  return n.toLocaleString("tr-TR");
}

function loadBinCount(): number {
  try {
    const raw = JSON.parse(localStorage.getItem("gtk_tahsilat_bins_v1") || "null");
    if (Array.isArray(raw)) return raw.length;
  } catch {
    /* yok */
  }
  return 0;
}

/** Tahsilat → Özet */
export default function OverviewPage() {
  const cards = useMemo(() => {
    const companies = loadCompanies();
    const activeCompanies = companies.filter((c) => c.active).length;
    const licenseOk = companies.filter((c) => licenseDaysLeft(c.licenseEndsAt) >= 30).length;
    const licenseWarn = companies.filter((c) => {
      const d = licenseDaysLeft(c.licenseEndsAt);
      return d >= 0 && d < 30;
    }).length;
    const licenseExpired = companies.filter((c) => licenseDaysLeft(c.licenseEndsAt) < 0).length;
    const licenseMissing = companies.filter((c) => !c.licenseEndsAt).length;

    const banks = loadBanks();
    const provinces = loadProvinces();
    const districts = loadDistricts();
    const cardTypes = loadCardTypes();
    const cardBrands = loadCardBrands();
    const bins = loadBinCount();

    const list: StatCard[] = [
      {
        key: "firms",
        title: "FİRMALAR",
        tone: "blue",
        icon: Building2,
        left: { label: "Toplam", value: formatTr(companies.length) },
        right: { label: "Aktif", value: formatTr(activeCompanies) },
      },
      {
        key: "lic-ok",
        title: "LİSANS — GEÇERLİ",
        tone: "green",
        icon: ShieldCheck,
        left: { label: "Aktif (>30 gün)", value: formatTr(licenseOk) },
        right: { label: "Yaklaşan (<30 gün)", value: formatTr(licenseWarn) },
      },
      {
        key: "lic-bad",
        title: "LİSANS — SORUNLU",
        tone: "red",
        icon: ShieldAlert,
        left: { label: "Süresi Dolmuş", value: formatTr(licenseExpired) },
        right: { label: "Tanımlanmamış", value: formatTr(licenseMissing) },
      },
      {
        key: "admins",
        title: "YÖNETİCİLER",
        tone: "purple",
        icon: Users,
        left: { label: "Toplam", value: "2" },
        right: { label: "Aktif", value: "2" },
      },
      {
        key: "banks",
        title: "BANKALAR & BIN",
        tone: "amber",
        icon: Warehouse,
        left: { label: "Bankalar", value: formatTr(banks.length) },
        right: { label: "BIN Listesi", value: formatTr(bins) },
      },
      {
        key: "cards",
        title: "KART TANIMLARI",
        tone: "teal",
        icon: CreditCard,
        left: { label: "Tipler", value: formatTr(cardTypes.length) },
        right: { label: "Markalar", value: formatTr(cardBrands.length) },
      },
      {
        key: "prov",
        title: "İLLER",
        tone: "pink",
        icon: IdCard,
        left: { label: "Toplam", value: formatTr(provinces.length) },
        right: { label: "Aktif", value: formatTr(provinces.filter((p) => p.active).length) },
      },
      {
        key: "dist",
        title: "İLÇELER",
        tone: "indigo",
        icon: MapPinned,
        left: { label: "Toplam", value: formatTr(districts.length) },
        right: { label: "Aktif", value: formatTr(districts.filter((d) => d.active).length) },
      },
    ];
    return list;
  }, []);

  return (
    <div className="bin-page overview-page">
      <div className="bin-page-head overview-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">TAHSİLAT</span>
          <h1>Hoş geldiniz</h1>
          <p>Sistem genel istatistiklerine genel bakış</p>
        </div>
      </div>

      <div className="overview-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.key} className={`overview-card tone-${card.tone}`}>
              <div className="overview-card-watermark" aria-hidden>
                <Icon size={72} strokeWidth={1.2} />
              </div>
              <div className="overview-card-top">
                <span className="overview-card-icon">
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <h2>{card.title}</h2>
              </div>
              <div className="overview-card-stats">
                <div>
                  <span>{card.left.label}</span>
                  <strong>{card.left.value}</strong>
                </div>
                <div>
                  <span>{card.right.label}</span>
                  <strong>{card.right.value}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
