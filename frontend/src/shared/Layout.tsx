import { useEffect, useState, type ReactNode } from "react";
import { Logo, Nav } from "./ui";
import type { View } from "./types";

export default function Layout({
  view,
  setView,
  theme,
  toggleTheme,
  logout,
  sidebarCollapsed,
  toggleSidebar,
  children,
}: {
  view: View;
  setView: (v: View) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  logout: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  children: ReactNode;
}) {
  const [headerPinned, setHeaderPinned] = useState(true);
  const [footerPinned, setFooterPinned] = useState(true);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [footerVisible, setFooterVisible] = useState(true);
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!headerPinned) setHeaderVisible(event.clientY < 24);
      if (!footerPinned) setFooterVisible(window.innerHeight - event.clientY < 24);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [headerPinned, footerPinned]);
  const titles: Record<View, string> = {
    dashboard: "Genel Yönetim",
    new: "Yeni API",
    keys: "API Keys",
    media: "Media",
    manage: "API Y\u00f6netimi",
    settings: "Ayarlar",
  };
  return (
    <div className={`layout admin-theme-${theme} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar" onDoubleClick={toggleSidebar} title="Daraltmak veya genişletmek için çift tıklayın">
        <div className="sidebar-brand"><span className="brand-mark">G</span><span className="brand-name"><Logo /></span></div>
        <nav className="nav">
          <Nav
            id="dashboard"
            view={view}
            set={setView}
            icon={"\u25a6"}
            label="Genel Yönetim"
          />
          <Nav id="keys" view={view} set={setView} icon={"\u2301"} label="API Keys" />
          <Nav id="media" view={view} set={setView} icon={"\u25a7"} label="Media" />
        </nav>
        <div className="sidebar-bottom">
          <button
            className={
              "settings-entry " + (view === "settings" ? "active" : "")
            }
            onClick={() => setView("settings")}
            aria-current={view === "settings" ? "page" : undefined}
          >
            <span className="settings-gear" aria-hidden="true"/>
            <span>Ayarlar</span>
          </button>
          <div className="sidebar-footer">
            api.guzelteknoloji.com
            <br />
            Web Service Console
          </div>
        </div>
      </aside>
      <main className="main">
        <header className={`header app-header ${headerVisible || headerPinned ? "bar-visible" : "bar-hidden"}`} onDoubleClick={() => { setHeaderPinned(value => !value); setHeaderVisible(true); }} title="Sabitlemek veya otomatik gizlemek için çift tıklayın">
          <div>
            <div className="eyebrow">Web Service Console</div>
            <h1>{titles[view]}</h1>
          </div>
          <div className="header-actions">
            <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Gündüz moduna geç" : "Gece moduna geç"} title={theme === "dark" ? "Gündüz modu" : "Gece modu"}>
              <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
              {theme === "dark" ? "Gündüz" : "Gece"}
            </button>
            <button className="btn soft" onClick={logout}>Çıkış</button>
          </div>
        </header>
        {children}
        <footer className={`app-footer ${footerVisible || footerPinned ? "bar-visible" : "bar-hidden"}`} onDoubleClick={() => { setFooterPinned(value => !value); setFooterVisible(true); }} title="Sabitlemek veya otomatik gizlemek için çift tıklayın">
          <span><i className="footer-status-dot"/> API yönetim servisi</span><span>api.guzelteknoloji.com</span><span>{footerPinned ? "Sabit" : "Otomatik gizleme"}</span>
        </footer>
      </main>
    </div>
  );
}
