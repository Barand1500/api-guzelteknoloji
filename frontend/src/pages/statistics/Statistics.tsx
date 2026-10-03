import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Download, Globe2, KeyRound, Search, Timer } from "lucide-react";
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
    gsap.fromTo(rootRef.current.querySelectorAll("[data-stat-card]"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.05, ease: "power2.out" });
  }, []);
  useEffect(() => {
    const bars = rootRef.current?.querySelectorAll<HTMLElement>(".statistics-bar-fill");
    if (!bars?.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(bars, { scaleY: 0, transformOrigin: "bottom" }, { scaleY: 1, duration: 0.45, stagger: 0.025, ease: "power2.out" });
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

  return <div className="statistics-page" ref={rootRef}>
    <header className="statistics-heading">
      <div><span className="statistics-kicker"><Activity size={14} /> API ANALİZİ</span><h1>İstatistikler</h1><p>Kullanım özetini ve başarılı API isteklerinin geçmişini birlikte inceleyin.</p></div>
      <label className="statistics-date"><CalendarDays size={16} /><input type="date" value={range.from} max={range.to} onChange={event => { setRange(current => ({ ...current, from: event.target.value })); setPage(1); }} aria-label="Başlangıç tarihi" /><span>–</span><input type="date" value={range.to} min={range.from} max={localDate(new Date())} onChange={event => { setRange(current => ({ ...current, to: event.target.value })); setPage(1); }} aria-label="Bitiş tarihi" /></label>
    </header>
    {error && <div className="statistics-error" role="alert">{error}</div>}
    <section className="statistics-metrics">
      <article data-stat-card><span><Activity size={17} /></span><small>Toplam istek</small><strong>{summary?.totals.requests.toLocaleString("tr-TR") ?? "—"}</strong><em>Seçilen tarih aralığında</em></article>
      <article data-stat-card><span><KeyRound size={17} /></span><small>Kullanılan anahtar</small><strong>{summary?.totals.activeKeys.toLocaleString("tr-TR") ?? "—"}</strong><em>En az bir istek gönderen</em></article>
      <article data-stat-card><span><Globe2 size={17} /></span><small>Kaynak site</small><strong>{summary?.totals.sites.toLocaleString("tr-TR") ?? "—"}</strong><em>İstek kayıtlarında görülen</em></article>
      <article data-stat-card><span><Timer size={17} /></span><small>Son istek</small><strong className="statistics-last">{summary?.totals.lastRequest ? new Date(summary.totals.lastRequest).toLocaleString("tr-TR") : "Henüz istek yok"}</strong><em>Başarılı ve yetkili istek</em></article>
    </section>
    <section className="statistics-chart-card">
      <div className="statistics-section-title"><div><h2>Günlük trafik</h2><p>İstek sayısı · {range.from} – {range.to}</p></div></div>
      <div className="statistics-chart" role="img" aria-label="Günlük API istek grafiği">
        {(summary?.daily || []).map(item => <div className="statistics-bar" key={String(item.day)} title={`${new Date(item.day).toLocaleDateString("tr-TR")}: ${item.requests} istek`}><strong>{item.requests || ""}</strong><div><i className="statistics-bar-fill" style={{ height: `${Math.max(item.requests ? 7 : 2, item.requests / maxRequests * 100)}%` }} /></div><small>{new Date(item.day).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</small></div>)}
        {!summary?.daily.length && <div className="statistics-no-data">Bu tarih aralığında istek kaydı yok.</div>}
      </div>
    </section>
    <div className="statistics-rankings">
      <section className="statistics-chart-card"><div className="statistics-section-title"><div><h2>Kategorilere göre</h2><p>En çok istek alan kategoriler</p></div></div>
        {(summary?.byCategory || []).slice(0, 5).map(item => <div className="statistics-rank" key={`${item.categoryId}-${item.name}`}><span>{item.name}</span><strong>{item.requests.toLocaleString("tr-TR")}</strong><i style={{ width: `${Math.max(4, item.requests / Math.max(1, summary?.byCategory[0]?.requests || 1) * 100)}%` }} /></div>)}
        {!summary?.byCategory.length && <p className="statistics-empty">Henüz kategori kullanım kaydı yok.</p>}
      </section>
      <section className="statistics-chart-card"><div className="statistics-section-title"><div><h2>Projeler</h2><p>En çok istek yapan API anahtarları</p></div></div>
        {(summary?.byProject || []).slice(0, 5).map(item => <div className="statistics-rank" key={item.keyId}><span>{item.projectName}</span><strong>{item.requests.toLocaleString("tr-TR")}</strong><i style={{ width: `${Math.max(4, item.requests / Math.max(1, summary?.byProject[0]?.requests || 1) * 100)}%` }} /></div>)}
        {!summary?.byProject.length && <p className="statistics-empty">Henüz proje kullanım kaydı yok.</p>}
      </section>
    </div>
    <section className="statistics-history">
      <div className="statistics-history-head"><div><h2>İstek geçmişi</h2><p>Bu servis şu anda yetkili başarılı istekleri kaydediyor.</p></div><button type="button" disabled={!logs?.rows.length} onClick={() => void exportCsv()}><Download size={15} /> CSV indir</button></div>
      <div className="statistics-filters">
        <label><Search size={16} /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Proje veya kaynak ara" /></label>
        <select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }} aria-label="Kategoriye göre filtrele"><option value="">Tüm kategoriler</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      <div className="statistics-table-wrap"><table><thead><tr><th>Tarih / saat</th><th>Proje</th><th>Kategori</th><th>Kaynak</th><th>Sonuç</th></tr></thead><tbody>{logs?.rows.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString("tr-TR")}</td><td>{row.projectName}</td><td>{row.categoryName || "—"}</td><td><code>{row.originHost || "Bilinmiyor"}</code></td><td><span className="statistics-status">Başarılı</span></td></tr>)}</tbody></table>{!loading && !logs?.rows.length && <div className="statistics-empty">Bu filtrelerle istek bulunamadı.</div>}</div>
      <footer className="statistics-pagination"><span>{logs?.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, logs.total)} / ${logs.total}` : "0 kayıt"}</span><div><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={15} /> Geri</button><strong>{page}</strong><button disabled={!logs || page * 25 >= logs.total} onClick={() => setPage(value => value + 1)}>İleri <ChevronRight size={15} /></button></div></footer>
    </section>
  </div>;
}
