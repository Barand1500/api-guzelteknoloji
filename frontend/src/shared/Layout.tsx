import gsap from "gsap";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Code2, FolderTree, HelpCircle, LogOut, Plus, Search } from "lucide-react";
import FolderSidebar from "./FolderSidebar";
import { NavIcon } from "./NavIcon";
import { QuickAccessGhost, QuickAccessSlots, useQuickAccess } from "./QuickAccess";
import { GlobalSearch } from "./GlobalSearch";
import { playLogoutPortal, dismissLogoutPortal } from "./logoutPortal";
import type { PanelPage, PanelPreferences, View } from "./types";

type Props = {
  view: View;
  setView: (view: View) => void;
  openCategory: (id: number) => void;
  openFolder: (id: number | null) => void;
  selectedCategoryId: number | null;
  token: string;
  logout: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  preferences: PanelPreferences;
  savePreferences: (preferences: PanelPreferences) => Promise<void>;
  preferencesError: string;
  children: ReactNode;
};
const pages: { id: PanelPage; label: string; icon: string }[] = [
  { id: "dashboard", label: "Genel Yönetim", icon: "home" },
  { id: "statistics", label: "İstatistikler", icon: "chart" },
  { id: "playground", label: "API Deneme Alanı", icon: "play" },
  { id: "schema-keys", label: "Şema", icon: "database" },
  { id: "keys", label: "API Anahtarları", icon: "briefcase" },
];
const titles: Record<View, string> = {
  dashboard: "Genel Yönetim",
  new: "Yeni Kategori",
  keys: "API Anahtarları",
  manage: "Tablo Yönetimi",
  statistics: "İstatistikler",
  playground: "API Deneme Alanı",
  "schema-keys": "Şema",
  settings: "Ayarlar",
  appearance: "Görünüm",
  guide: "Rehber",
};

export default function Layout({ view, setView, openCategory, openFolder, selectedCategoryId, token, logout, sidebarCollapsed, toggleSidebar, preferences, savePreferences, preferencesError, children }: Props) {
  const [headerAutoHide, setHeaderAutoHide] = useState(false);
  const [footerAutoHide, setFooterAutoHide] = useState(false);
  const [headerPeek, setHeaderPeek] = useState(false);
  const [footerPeek, setFooterPeek] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [folderMode, setFolderMode] = useState(false);
  const [profileMenuPosition, setProfileMenuPosition] = useState({ top: 0, left: 0 });
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const headerSlotRef = useRef<HTMLDivElement>(null);
  const footerBarRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const firstPill = useRef(true);
  const lastCollapsed = useRef(sidebarCollapsed);
  const activeView = view === "manage" || view === "new" ? "dashboard" : view;
  const orderedPages = preferences.sidebarOrder.map(id => pages.find(page => page.id === id)).filter((page): page is typeof pages[number] => Boolean(page));

  const updateQuickAccess = useCallback((quickAccess: PanelPreferences["quickAccess"]) => {
    void savePreferences({ ...preferences, quickAccess }).catch(() => undefined);
  }, [preferences, savePreferences]);
  const access = useQuickAccess(preferences.quickAccess, updateQuickAccess);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") { setSearchOpen(false); setProfileOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!profileOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!profileButtonRef.current?.contains(target) && !profileMenuRef.current?.contains(target)) setProfileOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [profileOpen]);
  useEffect(() => { if (headerSlotRef.current) gsap.to(headerSlotRef.current, { height: !headerAutoHide || headerPeek ? 64 : 0, duration: 0.3, ease: "power3.out" }); }, [headerAutoHide, headerPeek]);
  useEffect(() => { if (footerBarRef.current) gsap.to(footerBarRef.current, { height: !footerAutoHide || footerPeek ? 64 : 0, duration: 0.3, ease: "power3.out" }); }, [footerAutoHide, footerPeek]);
  useLayoutEffect(() => {
    const nav = navRef.current, pill = pillRef.current;
    if (!nav || !pill) return;
    const resizing = lastCollapsed.current !== sidebarCollapsed;
    lastCollapsed.current = sidebarCollapsed;
    const place = () => {
      const active = nav.querySelector<HTMLElement>(".is-nav-active");
      if (!active) { gsap.to(pill, { autoAlpha: 0, duration: 0.15 }); return; }
      const navBox = nav.getBoundingClientRect(), box = active.getBoundingClientRect();
      const compact = sidebarCollapsed || window.matchMedia("(max-width: 800px)").matches;
      gsap.killTweensOf(pill);
      gsap.to(pill, { autoAlpha: 1, top: box.top - navBox.top + nav.scrollTop, left: compact ? box.left - navBox.left : 12, width: compact ? box.width : navBox.width - 12, height: box.height, duration: firstPill.current || resizing ? 0 : 0.38, ease: "power3.out" });
      firstPill.current = false;
    };
    if (resizing) { gsap.killTweensOf(pill); gsap.set(pill, { autoAlpha: 0 }); }
    const timer = window.setTimeout(place, resizing ? 340 : 0);
    window.addEventListener("resize", place);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", place); gsap.killTweensOf(pill); };
  }, [activeView, sidebarCollapsed, preferences.sidebarOrder, folderMode]);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(folderMode ? ".folder-tree" : ".workspace-nav");
    if (!panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(panel, { autoAlpha: 0, x: folderMode ? 18 : -18 }, { autoAlpha: 1, x: 0, duration: 0.32, ease: "power2.out" });
  }, [folderMode]);

  function onBarDoubleClick(event: MouseEvent, bar: "header" | "footer") {
    if ((event.target as HTMLElement).closest("button,input,a,select,textarea,label")) return;
    if (bar === "header") { setHeaderAutoHide(value => !value); setHeaderPeek(false); }
    else { setFooterAutoHide(value => !value); setFooterPeek(false); }
  }
  function openPage(next: View) { setView(next); setSearchOpen(false); setProfileOpen(false); }
  function toggleProfile() {
    const rect = profileButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setProfileMenuPosition({
      top: Math.min(rect.bottom + 8, window.innerHeight - 56),
      left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)),
    });
    setProfileOpen(value => !value);
  }
  async function signOut() { setProfileOpen(false); await playLogoutPortal(); logout(); requestAnimationFrame(() => dismissLogoutPortal()); }

  return <div data-app-shell data-font-family={preferences.fontFamily} className={`workspace ${sidebarCollapsed && !folderMode ? "workspace-compact" : ""} ${folderMode ? "workspace-folder-mode" : ""}`}>
    <aside className="workspace-sidebar" onDoubleClick={event => { if (!(event.target as HTMLElement).closest("button,input,a")) toggleSidebar(); }} title="Boş alana çift tıkla: menüyü daralt veya genişlet">
      <div className="workspace-brand"><span className="workspace-brand-symbol"><Code2 size={28} strokeWidth={2.5} /><b>GT</b></span>{(!sidebarCollapsed || folderMode) && <span className="workspace-brand-copy"><strong>GÜZEL TEKNOLOJİ</strong><small>API Paneli</small></span>}</div>
      <div className="workspace-cta-wrap"><button className="workspace-primary" onPointerDown={event => access.pointerDown(event, "new")} onPointerUp={access.cancelHold} onPointerLeave={access.cancelHold} onClick={event => access.onNavClick(event, () => openPage("new"))} title="Yeni kategori"><Plus size={18} /><span>Yeni Kategori</span></button></div>
      {folderMode ? <FolderSidebar token={token} active={folderMode} refreshKey={view} selectedCategoryId={selectedCategoryId} onOpenFolder={openFolder} onOpenCategory={openCategory} /> : <nav ref={navRef} className="workspace-nav" aria-label="Ana menü"><div ref={pillRef} className={`workspace-active-pill ${sidebarCollapsed ? "compact" : ""}`} aria-hidden />
        {orderedPages.map(page => <button key={page.id} className={activeView === page.id ? "is-nav-active" : ""} onPointerDown={event => access.pointerDown(event, page.id)} onPointerUp={access.cancelHold} onPointerLeave={access.cancelHold} onClick={event => access.onNavClick(event, () => openPage(page.id))} title={page.label} aria-current={activeView === page.id ? "page" : undefined}><NavIcon name={page.icon} /><span>{page.label}</span></button>)}
      </nav>}
      <div className="workspace-sidebar-bottom">
        <button className={view === "guide" ? "selected" : ""} onClick={() => openPage("guide")} title="Rehber" aria-label="Rehber"><HelpCircle size={20} /></button>
        <button className={folderMode ? "selected" : ""} onClick={() => setFolderMode(value => !value)} title={folderMode ? "Normal menüye dön" : "Klasör yapısını göster"} aria-label={folderMode ? "Normal menüye dön" : "Klasör yapısını göster"} aria-pressed={folderMode}><FolderTree size={20} /></button>
        <button className={view === "appearance" ? "selected" : ""} onClick={() => openPage("appearance")} title="Görünüm" aria-label="Görünüm"><NavIcon name="sliders" size={19} /></button>
        <button className={view === "settings" ? "selected" : ""} onClick={() => openPage("settings")} title="Ayarlar" aria-label="Ayarlar"><NavIcon name="gear" size={19} /></button>
      </div>
    </aside>
    <div className="workspace-main">
      {headerAutoHide && !headerPeek && <div className="workspace-edge top" onMouseEnter={() => setHeaderPeek(true)} />}
      <div ref={headerSlotRef} className="workspace-bar-slot" onMouseLeave={() => { if (headerAutoHide) setHeaderPeek(false); }}><header className="workspace-header" onDoubleClick={event => onBarDoubleClick(event, "header")} title="Boş alana çift tıkla: üst çubuğu gizle veya sabitle"><button className="workspace-search" style={{ width: `min(${preferences.searchWidth}px, 38vw)` }} onClick={() => setSearchOpen(true)}><Search size={16} /><span>Ara...</span><kbd>Ctrl+K</kbd></button><QuickAccessSlots access={access} activeView={activeView} onOpen={openPage} /><div className="workspace-header-end"><div className="workspace-profile-wrap"><button ref={profileButtonRef} className="workspace-account" onClick={toggleProfile} aria-expanded={profileOpen} aria-haspopup="menu"><span className="workspace-avatar">GT</span><span><strong>Güzel Teknoloji</strong><small>Yönetici</small></span><ChevronRight size={14} /></button></div></div></header></div>
      <main className="workspace-content">
        {preferencesError && <div className="workspace-preferences-error" role="alert">{preferencesError}</div>}
        {view !== "dashboard" && view !== "manage" && view !== "keys" && <div className="workspace-breadcrumb"><button onClick={() => openPage("dashboard")}>Anasayfa</button><ChevronRight size={13} /><strong>{titles[view]}</strong></div>}
        {children}
      </main>
      {footerAutoHide && !footerPeek && <div className="workspace-edge bottom" onMouseEnter={() => setFooterPeek(true)} />}
      <div ref={footerBarRef} className="workspace-bar-slot" onMouseLeave={() => { if (footerAutoHide) setFooterPeek(false); }}><footer className="workspace-footer" onDoubleClick={event => onBarDoubleClick(event, "footer")} title="Boş alana çift tıkla: alt çubuğu gizle veya sabitle" /></div>
    </div>
    <QuickAccessGhost drag={access.drag} />
    {profileOpen && createPortal(<div ref={profileMenuRef} className="workspace-profile-menu" style={{ top: profileMenuPosition.top, left: profileMenuPosition.left }} role="menu"><button role="menuitem" onClick={signOut}><LogOut size={16} /> Çıkış yap</button></div>, document.body)}
    {searchOpen && <GlobalSearch token={token} onClose={() => setSearchOpen(false)} onOpenPage={openPage} onOpenCategory={id => { openCategory(id); setSearchOpen(false); }} />}
  </div>;
}
