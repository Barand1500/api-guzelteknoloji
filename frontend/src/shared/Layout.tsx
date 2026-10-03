import gsap from "gsap";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  Code2,
  FileKey2,
  Keyboard,
  LogOut,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { NavIcon } from "./NavIcon";
import type { View } from "./types";

type Props = {
  view: View;
  setView: (view: View) => void;
  logout: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  children: ReactNode;
};
const pages: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Genel Yönetim", icon: "home" },
  { id: "keys", label: "API Anahtarları", icon: "briefcase" },
];
const titles: Record<View, string> = {
  dashboard: "Genel Yönetim",
  new: "Yeni Kategori",
  keys: "API Anahtarları",
  manage: "Tablo Yönetimi",
  settings: "Ayarlar",
};

export default function Layout({
  view,
  setView,
  logout,
  sidebarCollapsed,
  toggleSidebar,
  children,
}: Props) {
  const [headerAutoHide, setHeaderAutoHide] = useState(false);
  const [footerAutoHide, setFooterAutoHide] = useState(false);
  const [headerPeek, setHeaderPeek] = useState(false);
  const [footerPeek, setFooterPeek] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [footerSlot, setFooterSlot] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const footerSlotRef = useRef<HTMLDivElement>(null);
  const headerSlotRef = useRef<HTMLDivElement>(null);
  const footerBarRef = useRef<HTMLDivElement>(null);
  const firstPill = useRef(true);
  const headerOpen = !headerAutoHide || headerPeek;
  const footerOpen = !footerAutoHide || footerPeek;
  const activeView = view === "manage" || view === "new" ? "dashboard" : view;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (view === "settings") setFooterSlot(2);
  }, [view]);
  useEffect(() => {
    if (headerSlotRef.current)
      gsap.to(headerSlotRef.current, {
        height: headerOpen ? 64 : 0,
        duration: 0.3,
        ease: "power3.out",
      });
  }, [headerOpen]);
  useEffect(() => {
    if (footerBarRef.current)
      gsap.to(footerBarRef.current, {
        height: footerOpen ? 64 : 0,
        duration: 0.3,
        ease: "power3.out",
      });
  }, [footerOpen]);
  useEffect(() => {
    const el = footerSlotRef.current;
    if (el)
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 8, scale: 0.92 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: "power2.out" },
      );
  }, [footerSlot]);
  useLayoutEffect(() => {
    const nav = navRef.current,
      pill = pillRef.current;
    if (!nav || !pill) return;
    const place = () => {
      const active = nav.querySelector<HTMLElement>(".is-nav-active");
      if (!active) {
        gsap.to(pill, { autoAlpha: 0, duration: 0.15 });
        return;
      }
      const navBox = nav.getBoundingClientRect(),
        box = active.getBoundingClientRect();
      const compact =
        sidebarCollapsed || window.matchMedia("(max-width: 800px)").matches;
      gsap.to(pill, {
        autoAlpha: 1,
        top: box.top - navBox.top + nav.scrollTop,
        left: compact ? box.left - navBox.left : 12,
        width: compact ? box.width : navBox.right - navBox.left - 12,
        height: box.height,
        duration: firstPill.current ? 0 : 0.38,
        ease: "power3.out",
      });
      firstPill.current = false;
    };
    gsap.set(pill, { autoAlpha: 0 });
    const timer = window.setTimeout(place, sidebarCollapsed ? 320 : 20);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", place);
      gsap.killTweensOf(pill);
    };
  }, [activeView, sidebarCollapsed]);

  function onBarDoubleClick(event: MouseEvent, bar: "header" | "footer") {
    if (
      (event.target as HTMLElement).closest(
        "button,input,a,select,textarea,label",
      )
    )
      return;
    if (bar === "header") {
      setHeaderAutoHide((value) => !value);
      setHeaderPeek(false);
    } else {
      setFooterAutoHide((value) => !value);
      setFooterPeek(false);
    }
  }
  function openPage(next: View) {
    setView(next);
    setSearchOpen(false);
    setSearch("");
    setProfileOpen(false);
  }
  const matches = [
    ...pages,
    { id: "new" as View, label: "Yeni Kategori", icon: "sliders" },
    { id: "settings" as View, label: "Ayarlar", icon: "gear" },
  ].filter((page) =>
    page.label
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );

  return (
    <div className={`workspace ${sidebarCollapsed ? "workspace-compact" : ""}`}>
      <aside
        className="workspace-sidebar"
        onDoubleClick={(event) => {
          if (!(event.target as HTMLElement).closest("button,input,a"))
            toggleSidebar();
        }}
        title="Boş alana çift tıkla: menüyü daralt veya genişlet"
      >
        <div className="workspace-brand">
          <span className="workspace-brand-symbol">
            <Code2 size={28} strokeWidth={2.5} />
            <b>GT</b>
          </span>
          {!sidebarCollapsed && (
            <span className="workspace-brand-copy">
              <strong>GÜZEL TEKNOLOJİ</strong>
              <small>API Yönetim Merkezi</small>
            </span>
          )}
        </div>
        <div className="workspace-cta-wrap">
          <button
            className="workspace-primary"
            onClick={() => openPage("new")}
            title="Yeni kategori"
          >
            <Plus size={18} />
            <span>Yeni Kategori</span>
          </button>
        </div>
        <nav ref={navRef} className="workspace-nav" aria-label="Ana menü">
          <div
            ref={pillRef}
            className={`workspace-active-pill ${sidebarCollapsed ? "compact" : ""}`}
            aria-hidden
          />
          {pages.map((page) => (
            <button
              key={page.id}
              className={activeView === page.id ? "is-nav-active" : ""}
              onClick={() => openPage(page.id)}
              title={page.label}
              aria-current={activeView === page.id ? "page" : undefined}
            >
              <NavIcon name={page.icon} />
              <span>{page.label}</span>
            </button>
          ))}
        </nav>
        <div
          className="workspace-sidebar-bottom"
          onWheel={(event) => {
            if (sidebarCollapsed && Math.abs(event.deltaY) > 4) {
              event.preventDefault();
              setFooterSlot(
                (value) => (value + (event.deltaY > 0 ? 1 : 2)) % 3,
              );
            }
          }}
          title={sidebarCollapsed ? "Kaydırarak aracı değiştir" : undefined}
        >
          <div ref={footerSlotRef} className="workspace-sidebar-tools">
            <button
              className={sidebarCollapsed && footerSlot === 0 ? "selected" : ""}
              onClick={() => setSearchOpen(true)}
              title="Ara"
            >
              <Search size={19} />
            </button>
            <button
              className={sidebarCollapsed && footerSlot === 1 ? "selected" : ""}
              onClick={toggleSidebar}
              title="Menüyü daralt veya genişlet"
            >
              <Keyboard size={19} />
            </button>
            <button
              className={
                sidebarCollapsed
                  ? footerSlot === 2
                    ? "selected"
                    : ""
                  : view === "settings"
                    ? "selected"
                    : ""
              }
              onClick={() => openPage("settings")}
              title="Ayarlar"
            >
              <NavIcon name="gear" size={19} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        {headerAutoHide && !headerPeek && (
          <div
            className="workspace-edge top"
            onMouseEnter={() => setHeaderPeek(true)}
          />
        )}
        <div
          ref={headerSlotRef}
          className="workspace-bar-slot"
          onMouseLeave={() => {
            if (headerAutoHide) setHeaderPeek(false);
          }}
        >
          <header
            className="workspace-header"
            onDoubleClick={(event) => onBarDoubleClick(event, "header")}
            title="Boş alana çift tıkla: üst çubuğu gizle veya sabitle"
          >
            <button
              className="workspace-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              <span>Ara...</span>
              <kbd>Ctrl+K</kbd>
            </button>
            <div className="workspace-header-shortcuts">
              <button
                onClick={() => openPage("dashboard")}
                title="Genel Yönetim"
              >
                <NavIcon name="home" size={16} />
              </button>
              <button onClick={() => openPage("new")} title="Yeni kategori">
                <Plus size={16} />
              </button>
              <button onClick={() => openPage("keys")} title="API Anahtarları">
                <FileKey2 size={16} />
              </button>
            </div>
            <div className="workspace-header-end">
              <div className="workspace-profile-wrap">
                <button
                  className="workspace-account"
                  onClick={() => setProfileOpen((value) => !value)}
                  aria-expanded={profileOpen}
                >
                  <span className="workspace-avatar">GT</span>
                  <span>
                    <strong>Güzel Teknoloji</strong>
                    <small>Yönetici</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
                {profileOpen && (
                  <div className="workspace-profile-menu">
                    <button onClick={() => openPage("settings")}>
                      <Settings2 size={16} /> Ayarlar
                    </button>
                    <button onClick={logout}>
                      <LogOut size={16} /> Çıkış yap
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
        </div>
        <main className="workspace-content">
          {view !== "dashboard" && (
            <div className="workspace-breadcrumb">
              <button onClick={() => openPage("dashboard")}>Anasayfa</button>
              <ChevronRight size={13} />
              <strong>{titles[view]}</strong>
            </div>
          )}
          {children}
        </main>
        {footerAutoHide && !footerPeek && (
          <div
            className="workspace-edge bottom"
            onMouseEnter={() => setFooterPeek(true)}
          />
        )}
        <div
          ref={footerBarRef}
          className="workspace-bar-slot"
          onMouseLeave={() => {
            if (footerAutoHide) setFooterPeek(false);
          }}
        >
          <footer
            className="workspace-footer"
            onDoubleClick={(event) => onBarDoubleClick(event, "footer")}
            title="Boş alana çift tıkla: alt çubuğu gizle veya sabitle"
          >
            <div className="workspace-footer-left">
              <button onClick={() => setSearchOpen(true)} title="Ara">
                <Search size={18} />
              </button>
              <button
                onClick={() => openPage("dashboard")}
                title="Genel Yönetim"
              >
                <NavIcon name="home" size={18} />
              </button>
              <button onClick={() => openPage("keys")} title="API Anahtarları">
                <NavIcon name="briefcase" size={18} />
              </button>
              <button onClick={() => openPage("settings")} title="Ayarlar">
                <NavIcon name="gear" size={18} />
              </button>
            </div>
            <div className="workspace-footer-right">
              <span className="workspace-online" /> API servisi{" "}
              <button onClick={() => openPage("settings")}>
                <Settings2 size={15} /> Ayarlar <ChevronRight size={13} />
              </button>
            </div>
          </footer>
        </div>
      </div>
      {searchOpen && (
        <div
          className="workspace-search-overlay"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="workspace-search-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <label>
              <Search size={18} />
              <input
                ref={searchInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Sayfa ara..."
                onKeyDown={(event) => {
                  if (event.key === "Enter" && matches[0])
                    openPage(matches[0].id);
                }}
              />
              <kbd>ESC</kbd>
            </label>
            <div>
              {matches.map((page) => (
                <button key={page.id} onClick={() => openPage(page.id)}>
                  <NavIcon name={page.icon} size={17} /> {page.label}
                  <ChevronRight size={14} />
                </button>
              ))}
              {!matches.length && <p>Sonuç bulunamadı.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
