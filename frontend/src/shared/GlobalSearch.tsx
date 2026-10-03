import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Database, FileKey2, Search, TableProperties, X } from "lucide-react";
import { request } from "./api";
import { NavIcon } from "./NavIcon";
import type { View } from "./types";

type Result = { id: string; kind: "category" | "column" | "row" | "key"; title: string; subtitle: string; categoryId?: number };
type Choice = { id: string; title: string; subtitle: string; icon: React.ReactNode; run: () => void };
const pages: { id: View; title: string; icon: string }[] = [
  { id: "dashboard", title: "Genel Yönetim", icon: "home" },
  { id: "new", title: "Yeni Kategori", icon: "code" },
  { id: "keys", title: "API Anahtarları", icon: "briefcase" },
  { id: "statistics", title: "İstatistikler", icon: "chart" },
  { id: "playground", title: "API Deneme Alanı", icon: "play" },
  { id: "schema-keys", title: "Şema ve Anahtarlar", icon: "database" },
  { id: "settings", title: "Ayarlar", icon: "gear" },
  { id: "appearance", title: "Görünüm", icon: "sliders" },
];
export function GlobalSearch({ token, onClose, onOpenPage, onOpenCategory }: { token: string; onClose: () => void; onOpenPage: (view: View) => void; onOpenCategory: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); if (dialog.current) gsap.fromTo(dialog.current, { y: -12, opacity: 0, scale: .98 }, { y: 0, opacity: 1, scale: 1, duration: .25, ease: "power2.out" }); }, []);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      request<Result[]>(`/admin/search?q=${encodeURIComponent(q)}`, token)
        .then(data => { if (!cancelled) setResults(data); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, token]);
  useEffect(() => setSelected(0), [query, results]);
  const normalized = query.toLocaleLowerCase("tr-TR");
  const choices: Choice[] = [
    ...pages.filter(page => page.title.toLocaleLowerCase("tr-TR").includes(normalized)).map(page => ({ id: page.id, title: page.title, subtitle: "Sayfa", icon: <NavIcon name={page.icon} size={18} />, run: () => onOpenPage(page.id) })),
    ...results.map(result => ({ id: result.id, title: result.title, subtitle: result.subtitle, icon: result.kind === "key" ? <FileKey2 size={18} /> : result.kind === "category" ? <Database size={18} /> : <TableProperties size={18} />, run: () => result.categoryId ? onOpenCategory(result.categoryId) : onOpenPage("keys") })),
  ];
  return <div className="workspace-search-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="workspace-search-dialog global-search">
      <label><Search size={19} /><input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Sayfa, kategori, sütun, kayıt veya anahtar ara..." onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected(value => Math.min(value + 1, choices.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected(value => Math.max(0, value - 1)); } if (event.key === "Enter") choices[selected]?.run(); if (event.key === "Escape") onClose(); }} /><button type="button" onClick={onClose} aria-label="Kapat"><X size={16} /></button></label>
      <div className="global-search-results">{choices.map((choice, index) => <button key={choice.id} className={selected === index ? "selected" : ""} onMouseEnter={() => setSelected(index)} onClick={choice.run}><span className="global-search-icon">{choice.icon}</span><span><strong>{choice.title}</strong><small>{choice.subtitle}</small></span><ArrowRight size={15} /></button>)}{loading && <p>Aranıyor...</p>}{!loading && !choices.length && <p>Sonuç bulunamadı.</p>}</div>
      <div className="global-search-hint"><span><kbd>↑</kbd><kbd>↓</kbd> Seç</span><span><kbd>Enter</kbd> Aç</span><span><kbd>Esc</kbd> Kapat</span></div>
    </div>
  </div>;
}
