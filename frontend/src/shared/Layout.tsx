import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, ChevronRight, CircleHelp, Database, FileKey2, FolderOpen, Keyboard, LayoutDashboard, LogOut, Moon, Plus, Search, Settings2, Sun } from "lucide-react";
import type { View } from "./types";

type Props = {
  view: View; setView: (view: View) => void; theme: "light" | "dark";
  toggleTheme: () => void; logout: () => void; sidebarCollapsed: boolean;
  toggleSidebar: () => void; children: ReactNode;
};

const pages: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Genel Yönetim", icon: LayoutDashboard },
  { id: "keys", label: "API Anahtarları", icon: FileKey2 },
  { id: "media", label: "Medya", icon: FolderOpen },
  { id: "settings", label: "Ayarlar", icon: Settings2 },
];
const titles: Record<View, string> = {
  dashboard: "Genel Yönetim", new: "Yeni Kategori", keys: "API Anahtarları",
  media: "Medya", manage: "Tablo Yönetimi", settings: "Ayarlar",
};

export default function Layout({ view, setView, theme, toggleTheme, logout, sidebarCollapsed, toggleSidebar, children }: Props) {
  const [headerPinned, setHeaderPinned] = useState(true);
  const [footerPinned, setFooterPinned] = useState(true);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [footerVisible, setFooterVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  const matches = pages.filter(page => page.label.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")));

  return <div className={`workspace admin-theme-${theme} ${sidebarCollapsed ? "workspace-compact" : ""} ${headerPinned ? "" : "workspace-header-auto"} ${footerPinned ? "" : "workspace-footer-auto"}`}>
    <aside className="workspace-sidebar" onDoubleClick={toggleSidebar} title="Daraltmak veya genişletmek için çift tıklayın">
      <div className="workspace-brand"><span className="workspace-brand-mark"><Database size={24} strokeWidth={2.4} /></span><span className="workspace-brand-copy"><strong>Güzel Teknoloji</strong><small>API Yönetim Merkezi</small></span></div>
      <button className="workspace-primary" onClick={() => setView("new")} title="Yeni kategori"><Plus size={18} /><span>Yeni kategori</span></button>
      <div className="workspace-nav-label">ÇALIŞMA ALANI</div>
      <nav className="workspace-nav" aria-label="Ana menü">{pages.map(page => {
        const Icon = page.icon;
        return <button key={page.id} className={view === page.id ? "active" : ""} onClick={() => setView(page.id)} title={page.label} aria-current={view === page.id ? "page" : undefined}><Icon size={18} /><span>{page.label}</span>{!sidebarCollapsed && view === page.id && <ChevronRight size={14} className="workspace-nav-arrow" />}</button>;
      })}</nav>
      <div className="workspace-sidebar-bottom"><div className="workspace-sidebar-note"><Activity size={15} /><span>Web servisi yönetimi</span></div><button className="workspace-collapse-hint" onClick={toggleSidebar} title="Menüyü daralt veya genişlet"><Keyboard size={16} /><span>Çift tıkla: menüyü {sidebarCollapsed ? "aç" : "daralt"}</span></button></div>
    </aside>

    <div className="workspace-main">
      {!headerPinned && <div className="workspace-edge workspace-edge-top" onMouseEnter={() => setHeaderVisible(true)} />}
      <header className={`workspace-header ${headerVisible || headerPinned ? "visible" : "hidden"}`} onMouseLeave={() => { if (!headerPinned) setHeaderVisible(false); }} onDoubleClick={() => { setHeaderPinned(value => !value); setHeaderVisible(true); }} title="Otomatik gizlemeyi açmak veya sabitlemek için çift tıklayın">
        <button className="workspace-search" onClick={() => setSearchOpen(true)}><Search size={17} /><span>Ara...</span><kbd>Ctrl+K</kbd></button>
        <div className="workspace-header-shortcuts"><button onClick={() => setView("dashboard")} title="Genel Yönetim"><LayoutDashboard size={17} /></button><button onClick={() => setView("new")} title="Yeni kategori"><Plus size={18} /></button><button onClick={() => setView("keys")} title="API Anahtarları"><FileKey2 size={17} /></button></div>
        <div className="workspace-header-end"><button className="workspace-theme" onClick={toggleTheme} aria-label={theme === "light" ? "Koyu tema" : "Açık tema"}>{theme === "light" ? <Sun size={18} /> : <Moon size={18} />}</button><button className="workspace-account" onClick={logout} title="Çıkış yap"><span className="workspace-avatar">GT</span><span><strong>Güzel Teknoloji</strong><small>Yönetici</small></span><LogOut size={16} /></button></div>
      </header>

      <main className="workspace-content"><div className="workspace-breadcrumb"><button onClick={() => setView("dashboard")}>Anasayfa</button><ChevronRight size={13} /><strong>{titles[view]}</strong></div>{children}</main>

      {!footerPinned && <div className="workspace-edge workspace-edge-bottom" onMouseEnter={() => setFooterVisible(true)} />}
      <footer className={`workspace-footer ${footerVisible || footerPinned ? "visible" : "hidden"}`} onMouseLeave={() => { if (!footerPinned) setFooterVisible(false); }} onDoubleClick={() => { setFooterPinned(value => !value); setFooterVisible(true); }} title="Otomatik gizlemeyi açmak veya sabitlemek için çift tıklayın"><div className="workspace-footer-left"><span className="workspace-online" /> <strong>Güzel Teknoloji</strong><span>API servisi</span></div><div className="workspace-footer-right"><button onClick={() => setSearchOpen(true)} title="Sayfa ara"><Search size={17} /></button><button onClick={() => setView("settings")} title="Ayarlar"><Settings2 size={17} /></button><span className="workspace-footer-divider" /><button onClick={() => setView("keys")}><FileKey2 size={15} /> API Anahtarları</button><button onClick={() => setView("settings")}><CircleHelp size={15} /> Yardım ve ayarlar</button></div></footer>
    </div>

    {searchOpen && <div className="workspace-search-overlay" onClick={() => setSearchOpen(false)}><div className="workspace-search-dialog" onClick={event => event.stopPropagation()}><label><Search size={19} /><input ref={searchInput} value={search} onChange={event => setSearch(event.target.value)} placeholder="Sayfa ara..." onKeyDown={event => { if (event.key === "Enter" && matches[0]) { setView(matches[0].id); setSearchOpen(false); setSearch(""); } }} /><kbd>ESC</kbd></label><div>{matches.map(page => { const Icon = page.icon; return <button key={page.id} onClick={() => { setView(page.id); setSearchOpen(false); setSearch(""); }}><Icon size={17} /> {page.label}<ChevronRight size={14} /></button>; })}{!matches.length && <p>Sonuç bulunamadı.</p>}</div></div></div>}
  </div>;
}
