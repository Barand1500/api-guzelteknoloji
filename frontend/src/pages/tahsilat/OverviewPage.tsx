import { useEffect, useState } from "react";
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
import { fetchTahsilatResource } from "./tahsilatApi";
import { licenseDaysLeft } from "./companiesStore";
import { str } from "./useTahsilatDb";
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

type Props = { token: string };

/** Tahsilat → Özet — sayılar MySQL’den */
export default function OverviewPage({ token }: Props) {
  const [cards, setCards] = useState<StatCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchTahsilatResource(token, "companies"),
      fetchTahsilatResource(token, "banks"),
      fetchTahsilatResource(token, "bins"),
      fetchTahsilatResource(token, "card-types"),
      fetchTahsilatResource(token, "card-brands"),
      fetchTahsilatResource(token, "provinces"),
      fetchTahsilatResource(token, "districts"),
    ])
      .then(([companies, banks, bins, cardTypes, cardBrands, provinces, districts]) => {
        if (cancelled) return;
        const firmRows = companies.rows || [];
        const activeCompanies = firmRows.filter((c) => c.active !== false).length;
        const licenseOk = firmRows.filter(
          (c) => licenseDaysLeft(str(c, "licenseEndsAt")) >= 30,
        ).length;
        const licenseWarn = firmRows.filter((c) => {
          const d = licenseDaysLeft(str(c, "licenseEndsAt"));
          return d >= 0 && d < 30;
        }).length;
        const licenseExpired = firmRows.filter(
          (c) => licenseDaysLeft(str(c, "licenseEndsAt")) < 0,
        ).length;
        const licenseMissing = firmRows.filter((c) => !str(c, "licenseEndsAt")).length;

        setCards([
          {
            key: "firms",
            title: "FİRMALAR",
            tone: "blue",
            icon: Building2,
            left: { label: "Toplam", value: formatTr(firmRows.length) },
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
            left: { label: "Toplam", value: "—" },
            right: { label: "Aktif", value: "—" },
          },
          {
            key: "banks",
            title: "BANKALAR & BIN",
            tone: "amber",
            icon: Warehouse,
            left: { label: "Bankalar", value: formatTr((banks.rows || []).length) },
            right: { label: "BIN Listesi", value: formatTr((bins.rows || []).length) },
          },
          {
            key: "cards",
            title: "KART TANIMLARI",
            tone: "teal",
            icon: CreditCard,
            left: { label: "Tipler", value: formatTr((cardTypes.rows || []).length) },
            right: { label: "Markalar", value: formatTr((cardBrands.rows || []).length) },
          },
          {
            key: "prov",
            title: "İLLER",
            tone: "pink",
            icon: IdCard,
            left: { label: "Toplam", value: formatTr((provinces.rows || []).length) },
            right: {
              label: "Aktif",
              value: formatTr((provinces.rows || []).filter((p) => p.active !== false).length),
            },
          },
          {
            key: "dist",
            title: "İLÇELER",
            tone: "indigo",
            icon: MapPinned,
            left: { label: "Toplam", value: formatTr((districts.rows || []).length) },
            right: {
              label: "Aktif",
              value: formatTr((districts.rows || []).filter((d) => d.active !== false).length),
            },
          },
        ]);
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="bin-page overview-page">
      <div className="bin-page-head overview-head">
        <div className="bin-page-head-copy">
          <span className="bin-page-eyebrow">TAHSİLAT</span>
          <h1>Hoş geldiniz</h1>
          <p>{loading ? "İstatistikler yükleniyor…" : "Sistem genel istatistiklerine genel bakış"}</p>
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
