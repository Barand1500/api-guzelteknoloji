import { useState } from "react";
import Login from "./pages/login/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import NewCategory from "./pages/category/NewCategory";
import CategoryEditor from "./pages/category/CategoryEditor";
import Keys from "./pages/keys/Keys";
import Media from "./pages/media/Media";
import Settings from "./pages/settings/Settings";
import Layout from "./shared/Layout";
import type { Category, View } from "./shared/types";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gtk_token")),
    [view, setView] = useState<View>("dashboard"),
    [selected, setSelected] = useState<Category | null>(null),
    [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("gtk_sidebar_collapsed") === "true"),
    [adminTheme, setAdminTheme] = useState<"light" | "dark">(
      () => localStorage.getItem("gtk_admin_theme") === "light" ? "light" : "dark",
    );
  if (!token)
    return (
      <Login
        onLogin={(v) => {
          localStorage.setItem("gtk_token", v);
          setToken(v);
        }}
      />
    );
  const go = (v: View) => {
    setView(v);
    if (v !== "manage") setSelected(null);
  };
  return (
    <Layout
      view={view}
      setView={go}
      theme={adminTheme}
      toggleTheme={() => setAdminTheme((current) => {
        const next = current === "dark" ? "light" : "dark";
        localStorage.setItem("gtk_admin_theme", next);
        return next;
      })}
      logout={() => {
        localStorage.removeItem("gtk_token");
        setToken(null);
      }}
      sidebarCollapsed={sidebarCollapsed}
      toggleSidebar={() => setSidebarCollapsed(value => { const next = !value; localStorage.setItem("gtk_sidebar_collapsed", String(next)); return next; })}
    >
      {view === "dashboard" ? (
        <Dashboard
          token={token}
          manage={(c) => {
            setSelected(c);
            setView("manage");
          }}
          create={() => setView("new")}
        />
      ) : view === "new" ? (
        <NewCategory token={token} done={() => go("dashboard")} />
      ) : view === "keys" ? (
        <Keys token={token} />
      ) : view === "media" ? (
        <Media token={token} />
      ) : view === "settings" ? (
        <Settings token={token} />
      ) : (
        selected && (
          <CategoryEditor
            token={token}
            category={selected}
            back={() => go("dashboard")}
          />
        )
      )}
    </Layout>
  );
}
