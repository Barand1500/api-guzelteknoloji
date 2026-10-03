import { useCallback, useEffect, useState } from "react";
import Login from "./pages/login/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import NewCategory from "./pages/category/NewCategory";
import CategoryEditor from "./pages/category/CategoryEditor";
import Keys from "./pages/keys/Keys";
import Settings from "./pages/settings/Settings";
import Statistics from "./pages/statistics/Statistics";
import ApiPlayground from "./pages/playground/ApiPlayground";
import SchemaKeys from "./pages/schema-keys/SchemaKeys";
import Appearance from "./pages/appearance/Appearance";
import Layout from "./shared/Layout";
import type { Category, PanelPage, PanelPreferences, View } from "./shared/types";
import { request } from "./shared/api";

const defaultPreferences: PanelPreferences = {
  sidebarOrder: ["dashboard", "statistics", "playground", "schema-keys", "keys"],
  quickAccess: ["dashboard", "keys", null, null, null, null],
  searchWidth: 300,
  fontFamily: "inter",
};

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gtk_token")),
    [view, setView] = useState<View>("dashboard"),
    [selected, setSelected] = useState<Category | null>(null),
    [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("gtk_sidebar_collapsed") === "true"),
    [preferences, setPreferences] = useState<PanelPreferences>(defaultPreferences),
    [preferencesError, setPreferencesError] = useState("");

  const savePreferences = useCallback(async (next: PanelPreferences) => {
    setPreferencesError("");
    try {
      const result = await request<PanelPreferences>("/admin/panel-preferences", token, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setPreferences(result);
    } catch (reason) {
      setPreferencesError((reason as Error).message);
      throw reason;
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    request<PanelPreferences & { configured?: boolean }>("/admin/panel-preferences", token)
      .then(async result => {
        if (cancelled) return;
        let next: PanelPreferences = {
          sidebarOrder: result.sidebarOrder,
          quickAccess: result.quickAccess,
          searchWidth: result.searchWidth,
          fontFamily: result.fontFamily || "inter",
        };
        if (!result.configured) {
          try {
            const legacy = JSON.parse(localStorage.getItem("gtk_quick_access") || "null");
            const allowed: PanelPage[] = ["dashboard", "new", "keys", "statistics", "playground", "schema-keys", "settings", "appearance"];
            if (Array.isArray(legacy)) next.quickAccess = Array.from({ length: 6 }, (_, index) => allowed.includes(legacy[index]) ? legacy[index] : null);
          } catch {
            next = { ...next, quickAccess: defaultPreferences.quickAccess };
          }
          if (localStorage.getItem("gtk_quick_access")) {
            try { next = await request<PanelPreferences>("/admin/panel-preferences", token, { method: "PUT", body: JSON.stringify(next) }); }
            catch (reason) { if (!cancelled) setPreferencesError((reason as Error).message); }
          }
        }
        if (!cancelled) setPreferences(next);
      })
      .catch(reason => { if (!cancelled) setPreferencesError((reason as Error).message); });
    return () => { cancelled = true; };
  }, [token]);

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
      token={token}
      openCategory={async id => {
        try {
          const categories = await request<Category[]>("/admin/categories", token);
          const category = categories.find(item => item.id === id);
          if (category) { setSelected(category); setView("manage"); }
        } catch { /* The destination remains unchanged when loading fails. */ }
      }}
      logout={() => {
        localStorage.removeItem("gtk_token");
        setToken(null);
      }}
      sidebarCollapsed={sidebarCollapsed}
      toggleSidebar={() => setSidebarCollapsed(value => { const next = !value; localStorage.setItem("gtk_sidebar_collapsed", String(next)); return next; })}
      preferences={preferences}
      savePreferences={savePreferences}
      preferencesError={preferencesError}
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
        <NewCategory token={token} done={() => go("dashboard")} manage={category => { setSelected(category); setView("manage"); }} />
      ) : view === "keys" ? (
        <Keys token={token} />
      ) : view === "settings" ? (
        <Settings token={token} />
      ) : view === "statistics" ? (
        <Statistics token={token} />
      ) : view === "playground" ? (
        <ApiPlayground token={token} />
      ) : view === "schema-keys" ? (
        <SchemaKeys token={token} />
      ) : view === "appearance" ? (
        <Appearance preferences={preferences} onSave={savePreferences} />
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
