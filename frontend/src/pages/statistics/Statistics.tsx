import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { request } from "../../shared/api";
import type { Category, UsageLogPage, UsageSummary } from "../../shared/types";
import { Loading } from "../../shared/ui";
import "./statistics.css";

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function defaultRange() {
  const to = new Date(), from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: localDate(from), to: localDate(to) };
}
function formatDay(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}
function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function Statistics({ token }: { token: string }) {
  const [range, setRange] = useState(defaultRange);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [logs, setLogs] = useState<UsageLogPage | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const queryString = useMemo(() => new URLSearchParams({
    from: range.from,
    to: range.to,
    page: String(page),
    pageSize: "25",
    q: query.trim(),
    ...(categoryId ? { categoryId } : {}),
  }).toString(), [range, page, query, categoryId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      request<UsageSummary>(`/admin/usage/summary?from=${range.from}&to=${range.to}`, token),
      request<UsageLogPage>(`/admin/usage/logs?${queryString}`, token),
      categories.length ? Promise.resolve(categories) : request<Category[]>("/admin/categories", token),
    ]).then(([nextSummary, nextLogs, nextCategories]) => {
      if (cancelled) return;
      setSummary(nextSummary);
      setLogs(nextLogs);
      setCategories(nextCategories);
    }).catch(reason => { if (!cancelled) setError((reason as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, range, queryString]);

  useEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(rootRef.current.querySelectorAll(".statistics-metric"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power2.out" });
  }, [summary]);
  useEffect(() => {
    const bars = rootRef.current?.querySelectorAll<HTMLElement>(".statistics-bar-fill");
    if (!bars?.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(bars, { scaleY: 0, transformOrigin: "bottom" }, { scaleY: 1, duration: 0.45, stagger: 0.025, ease: "power2.out" });
    gsap.fromTo(rootRef.current?.querySelectorAll(".statistics-project-fill") || [], { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, duration: .55, stagger: .08, ease: "power2.out" });
  }, [summary]);

  async function exportCsv() {
    if (!logs) return;
    const rows = [
      ["Tarih", "Proje", "Kategori", "Kaynak", "Durum"],
      ...logs.rows.map(row => [new Date(row.createdAt).toLocaleString("tr-TR"), row.projectName, row.categoryName || "", row.originHost || "", "Başarılı"]),
    ];
    const blob = new Blob(["\uFEFF", ...rows.map(row => row.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `api-istekleri-${range.from}-${range.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !summary) return <Loading />;
  const maxRequests = Math.max(1, ...(summary?.daily.map(item => item.requests) || []));
  const chartStep = Math.pow(10, Math.floor(Math.log10(maxRequests)));
  const chartCeiling = Math.ceil(maxRequests / (chartStep * 2)) * chartStep * 2;
  const projects = summary?.byProject.slice(0, 5) || [];
  const maxProject = Math.max(1, ...projects.map(item => item.requests));
  const lastRequest = summary?.totals.lastRequest ? new Date(summary.totals.lastRequest).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  return <div className="statistics-page" ref={rootRef}>
    <header className="statistics-heading">
      <div><span className="statistics-eyebrow">API RAPORU</span><h1>İstatistikler</h1></div>
      <div className="statistics-date" aria-label="Tarih aralığı"><CalendarDays size={18} /><input type="date" value={range.from} max={range.to} onChange={event => { setRange(current => ({ ...current, from: event.target.value })); setPage(1); }} aria-label="Başlangıç tarihi" /><span>—</span><input type="date" value={range.to} min={range.from} max={localDate(new Date())} onChange={event => { setRange(current => ({ ...current, to: event.target.value })); setPage(1); }} aria-label="Bitiş tarihi" /></div>
    </header>
    {error && <div className="statistics-error" role="alert">{error}</div>}
    <section className="statistics-metrics" aria-label="Kullanım özeti">
      <article className="statistics-metric primary"><strong>{summary?.totals.requests.toLocaleString("tr-TR") ?? "—"}</strong><span>Toplam istek</span></article>
      <article className="statistics-metric"><strong>{summary?.totals.activeKeys.toLocaleString("tr-TR") ?? "—"}</strong><span>Kullanılan anahtar</span></article>
      <article className="statistics-metric"><strong>{summary?.totals.sites.toLocaleString("tr-TR") ?? "—"}</strong><span>Kaynak site</span></article>
      <article className="statistics-metric last"><strong>{lastRequest}</strong><span>Son istek</span></article>
    </section>
    <div className="statistics-main">
      <section className="statistics-traffic" aria-labelledby="statistics-traffic-title">
        <div className="statistics-section-heading"><h2 id="statistics-traffic-title">Günlük trafik</h2><span>{range.from} — {range.to}</span></div>
        <div className="statistics-chart-scroll"><div className="statistics-chart" style={{ minWidth: Math.max(490, (summary?.daily.length || 0) * 48 + 54) }} role="img" aria-label="Günlük API istek grafiği">
          {summary?.daily.length ? <><div className="statistics-chart-axis" aria-hidden><span>{chartCeiling.toLocaleString("tr-TR")}</span><span>{Math.round(chartCeiling / 2).toLocaleString("tr-TR")}</span><span>0</span></div><div className="statistics-chart-plot"><div className="statistics-chart-lines" aria-hidden><i /><i /><i /></div><div className="statistics-bars">{summary.daily.map(item => <div className={`statistics-bar ${item.requests === maxRequests && maxRequests > 0 ? "peak" : ""}`} key={String(item.day)} title={`${formatDay(String(item.day))}: ${item.requests.toLocaleString("tr-TR")} istek`}><div className="statistics-bar-area"><span className="statistics-bar-value" style={{ bottom: `calc(${item.requests ? Math.max(3, item.requests / chartCeiling * 100) : 0}% + 8px)` }}>{item.requests.toLocaleString("tr-TR")}</span><i className="statistics-bar-fill" style={{ height: `${item.requests ? Math.max(3, item.requests / chartCeiling * 100) : 0}%` }} /></div><small>{formatDay(String(item.day))}</small></div>)}</div></div></> : <div className="statistics-no-data">Bu tarih aralığında istek kaydı yok.</div>}
        </div></div>
      </section>
      <section className="statistics-categories" aria-labelledby="statistics-categories-title"><div className="statistics-section-heading"><h2 id="statistics-categories-title">İlk beş kategori</h2></div><ol>{summary?.byCategory.slice(0, 5).map((item, index) => <li key={`${item.categoryId}-${item.name}`}><span className="statistics-category-number">{index + 1}</span><span className="statistics-category-name" title={item.name}>{item.name}</span><strong>{item.requests.toLocaleString("tr-TR")}</strong></li>)}</ol>{!summary?.byCategory.length && <p className="statistics-no-data">Henüz kategori kullanımı yok.</p>}</section>
    </div>
    <section className="statistics-projects" aria-labelledby="statistics-projects-title"><div className="statistics-section-heading"><h2 id="statistics-projects-title">Proje sıralaması</h2><span>En çok istek yapan projeler</span></div><div className="statistics-project-list">{projects.map((item, index) => <div className="statistics-project" key={item.keyId}><div className="statistics-project-label"><span>{String(index + 1).padStart(2, "0")}</span><strong title={item.projectName}>{item.projectName}</strong><em>{item.requests.toLocaleString("tr-TR")}</em></div><div className="statistics-project-track"><i className="statistics-project-fill" style={{ width: `${item.requests / maxProject * 100}%` }} /></div></div>)}</div>{!projects.length && <p className="statistics-no-data">Henüz proje kullanımı yok.</p>}</section>
    <section className="statistics-history">
      <div className="statistics-history-head"><div><h2>İstek geçmişi</h2><p>Başarılı ve yetkili istekler</p></div><button type="button" disabled={!logs?.rows.length} onClick={() => void exportCsv()}><Download size={17} /> CSV indir</button></div>
      <div className="statistics-filters">
        <label><Search size={18} /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Proje veya kaynak ara" aria-label="Proje veya kaynak ara" /></label>
        <select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }} aria-label="Kategoriye göre filtrele"><option value="">Tüm kategoriler</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      <div className="statistics-table-wrap"><table><thead><tr><th>Tarih / saat</th><th>Proje</th><th>Kategori</th><th>Kaynak</th><th>Sonuç</th></tr></thead><tbody>{logs?.rows.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString("tr-TR")}</td><td>{row.projectName}</td><td>{row.categoryName || "—"}</td><td><code>{row.originHost || "Bilinmiyor"}</code></td><td><span className="statistics-status"><Check size={13} /> Başarılı</span></td></tr>)}</tbody></table>{!loading && !logs?.rows.length && <div className="statistics-empty">Bu filtrelerle istek bulunamadı.</div>}</div>
      <footer className="statistics-pagination"><span>{logs?.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, logs.total)} / ${logs.total}` : "0 kayıt"}</span><div><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={15} /> Geri</button><strong>{page}</strong><button disabled={!logs || page * 25 >= logs.total} onClick={() => setPage(value => value + 1)}>İleri <ChevronRight size={15} /></button></div></footer>
    </section>
  </div>;
}
