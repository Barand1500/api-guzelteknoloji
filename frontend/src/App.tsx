import { useCallback, useEffect, useState } from "react";
import Login from "./pages/login/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import NewCategory from "./pages/category/NewCategory";
import CategoryEditor from "./pages/category/CategoryEditor";
import Keys from "./pages/keys/Keys";
import Settings from "./pages/settings/Settings";
import Statistics from "./pages/statistics/Statistics";
import ApiPlayground from "./pages/playground/ApiPlayground";
import Schema from "./pages/schema/Schema";
import Appearance from "./pages/appearance/Appearance";
import Guide from "./pages/guide/Guide";
import GuideTour from "./pages/guide/GuideTour";
import { guideSteps } from "./pages/guide/guideContent";
import BanksListPage from "./pages/tahsilat/BanksListPage";
import BinListPage from "./pages/tahsilat/BinListPage";
import CardBrandsListPage from "./pages/tahsilat/CardBrandsListPage";
import CardKindsListPage from "./pages/tahsilat/CardKindsListPage";
import CardTypesListPage from "./pages/tahsilat/CardTypesListPage";
import ContractsListPage from "./pages/tahsilat/ContractsListPage";
import CurrenciesListPage from "./pages/tahsilat/CurrenciesListPage";
import DistrictsListPage from "./pages/tahsilat/DistrictsListPage";
import EmailSettingsPage from "./pages/tahsilat/EmailSettingsPage";
import ModulesListPage from "./pages/tahsilat/ModulesListPage";
import ProvincesListPage from "./pages/tahsilat/ProvincesListPage";
import TahsilatPlaceholder from "./pages/tahsilat/TahsilatPlaceholder";
import TaxOfficesListPage from "./pages/tahsilat/TaxOfficesListPage";
import TemplateVarsListPage from "./pages/tahsilat/TemplateVarsListPage";
import VirtualPosListPage from "./pages/tahsilat/VirtualPosListPage";
import Layout from "./shared/Layout";
import { isTahsilatPageId, type TahsilatPageId } from "./shared/tahsilatNav";
import type { Category, PanelPage, PanelPreferences, View } from "./shared/types";
import { request } from "./shared/api";

function readTahsilatPage(): TahsilatPageId {
  const stored = localStorage.getItem("gtk_tahsilat_page") || "";
  return isTahsilatPageId(stored) ? stored : "ozet";
}

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
    [preferencesError, setPreferencesError] = useState(""),
    [tourStep, setTourStep] = useState<number | null>(null),
    [guideCategory, setGuideCategory] = useState<Category | null>(null);
  const [openedFolderId, setOpenedFolderId] = useState<number | null>(null);
  const [folderOpenSequence, setFolderOpenSequence] = useState(0);
  const [tahsilatPage, setTahsilatPage] = useState<TahsilatPageId>(readTahsilatPage);

  useEffect(() => {
    if (view !== "guide" || !token) return;
    let cancelled = false;
    request<Category[]>("/admin/categories", token)
      .then(categories => { if (!cancelled) setGuideCategory(categories[0] || null); })
      .catch(() => { if (!cancelled) setGuideCategory(null); });
    return () => { cancelled = true; };
  }, [view, token]);

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
    setTourStep(null);
    if (v === "new") { setOpenedFolderId(null); setFolderOpenSequence(value => value + 1); }
    setView(v);
    if (v !== "manage") setSelected(null);
  };
  const steps = guideSteps(Boolean(guideCategory));
  async function startTour() {
    try {
      const categories = await request<Category[]>("/admin/categories", token!);
      setGuideCategory(categories[0] || null);
    } catch { setGuideCategory(null); }
    setView("dashboard");
    setTourStep(0);
  }
  function moveTour(index: number) {
    const nextSteps = guideSteps(Boolean(guideCategory));
    if (index >= nextSteps.length) { setTourStep(null); go("guide"); return; }
    if (index < 0) return;
    if (nextSteps[index].view === "manage" && guideCategory) setSelected(guideCategory);
    setView(nextSteps[index].view);
    setTourStep(index);
  }
  function openGuideChapter(next: View) {
    if (next === "manage" && guideCategory) setSelected(guideCategory);
    setView(next);
  }
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
      openFolder={id => { setOpenedFolderId(id); setFolderOpenSequence(value => value + 1); setTourStep(null); setView("new"); }}
      selectedCategoryId={view === "manage" ? selected?.id ?? null : null}
      logout={() => {
        localStorage.removeItem("gtk_token");
        setToken(null);
      }}
      sidebarCollapsed={sidebarCollapsed}
      toggleSidebar={() => setSidebarCollapsed(value => { const next = !value; localStorage.setItem("gtk_sidebar_collapsed", String(next)); return next; })}
      preferences={preferences}
      savePreferences={savePreferences}
      preferencesError={preferencesError}
      tahsilatPage={tahsilatPage}
      setTahsilatPage={setTahsilatPage}
    >
      {view === "dashboard" ? (
        <Dashboard
          token={token}
          manage={(c) => {
            setSelected(c);
            setView("manage");
          }}
          create={() => go("new")}
        />
      ) : view === "new" ? (
        <NewCategory token={token} initialFolderId={openedFolderId} openSequence={folderOpenSequence} done={() => go("dashboard")} openKeys={() => go("keys")} manage={category => { setSelected(category); setView("manage"); }} />
      ) : view === "keys" ? (
        <Keys token={token} />
      ) : view === "settings" ? (
        <Settings token={token} />
      ) : view === "statistics" ? (
        <Statistics token={token} />
      ) : view === "playground" ? (
        <ApiPlayground token={token} />
      ) : view === "schema-keys" ? (
        <Schema token={token} />
      ) : view === "appearance" ? (
        <Appearance preferences={preferences} onSave={savePreferences} />
      ) : view === "guide" ? (
        <Guide onStart={() => void startTour()} onOpen={openGuideChapter} hasCategory={Boolean(guideCategory)} />
      ) : view === "tahsilat" ? (
        tahsilatPage === "odeme-bin" ? (
          <BinListPage />
        ) : tahsilatPage === "odeme-bankalar" ? (
          <BanksListPage />
        ) : tahsilatPage === "odeme-sanal-pos" ? (
          <VirtualPosListPage />
        ) : tahsilatPage === "genel-para" ? (
          <CurrenciesListPage />
        ) : tahsilatPage === "genel-sozlesmeler" ? (
          <ContractsListPage />
        ) : tahsilatPage === "genel-vergi" ? (
          <TaxOfficesListPage />
        ) : tahsilatPage === "kart-tipler" ? (
          <CardTypesListPage />
        ) : tahsilatPage === "kart-turler" ? (
          <CardKindsListPage />
        ) : tahsilatPage === "kart-markalar" ? (
          <CardBrandsListPage />
        ) : tahsilatPage === "cografi-iller" ? (
          <ProvincesListPage />
        ) : tahsilatPage === "cografi-ilceler" ? (
          <DistrictsListPage />
        ) : tahsilatPage === "sistem-moduller" ? (
          <ModulesListPage />
        ) : tahsilatPage === "sistem-sablon" ? (
          <TemplateVarsListPage />
        ) : tahsilatPage === "sistem-eposta" ? (
          <EmailSettingsPage />
        ) : (
          <TahsilatPlaceholder page={tahsilatPage} />
        )
      ) : (
        selected && (
          <CategoryEditor
            token={token}
            category={selected}
            back={() => go("dashboard")}
          />
        )
      )}
      {tourStep !== null && steps[tourStep] && <GuideTour step={steps[tourStep]} index={tourStep} total={steps.length} onPrevious={() => moveTour(tourStep - 1)} onNext={() => moveTour(tourStep + 1)} onClose={() => setTourStep(null)} />}
    </Layout>
  );
}
