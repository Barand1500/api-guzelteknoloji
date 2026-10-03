import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import LiquidCarveButton from "./components/LiquidCarveButton";
type View = "dashboard" | "new" | "keys" | "media" | "manage" | "settings";
type Category = { id: number; name: string; slug: string; active: boolean };
type State = { enabled: boolean; categories: Category[] };
type Column = { id: number; name: string; fieldType: string };
type DataRow = { id: string; data: Record<string, string>; active: boolean };
type Schema = { category: Category; columns: Column[]; rows: DataRow[] };
type ApiKey = {
  id: string;
  projectName: string;
  apiKey: string;
  active: boolean;
  usageCount: number;
  siteCount: number;
  categoryNames: string[];
  categoryIds: number[];
};
type Media = { id: string; name: string; url: string; mimeType: string };
type LoginSettings = {
  theme: "light" | "dark";
  quickLoginEnabled: boolean;
  imageUrl: string;
};
const DEFAULT_LOGIN_SETTINGS: LoginSettings = {
  theme: "light",
  quickLoginEnabled: true,
  imageUrl: "/login-character.jpg",
};
async function request<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers }),
    json = await res.json();
  if (!res.ok) throw new Error(json.message || "İstek başarısız");
  return json.data ?? json;
}
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gtk_token")),
    [view, setView] = useState<View>("dashboard"),
    [selected, setSelected] = useState<Category | null>(null),
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
    >
      {view === "dashboard" ? (
        <Dashboard
          token={token}
          manage={(c) => {
            setSelected(c);
            setView("manage");
          }}
        />
      ) : view === "new" ? (
        <NewApi token={token} done={() => go("dashboard")} />
      ) : view === "keys" ? (
        <Keys token={token} />
      ) : view === "media" ? (
        <MediaPage token={token} />
      ) : view === "settings" ? (
        <LoginSettingsPage token={token} />
      ) : (
        selected && (
          <CategoryManager
            token={token}
            category={selected}
            back={() => go("dashboard")}
          />
        )
      )}
    </Layout>
  );
}
function Login({ onLogin }: { onLogin: (v: string) => void }) {
  const [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("admin@guzelteknoloji.com"),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [mode, setMode] = useState<"choose" | "password" | "otp">("choose");
  const [settings, setSettings] = useState<LoginSettings>(
    DEFAULT_LOGIN_SETTINGS,
  );
  useEffect(() => {
    let cancelled = false;
    request<LoginSettings>("/login/settings", null)
      .then((value) => {
        if (!cancelled) setSettings({ ...DEFAULT_LOGIN_SETTINGS, ...value });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  function chooseMode(next: "choose" | "password" | "otp") {
    setMode(next);
    setError("");
    setPassword("");
    setCode("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = mode === "otp" ? "/auth/verify-otp" : "/auth/login";
      const body = mode === "otp" ? { email, code } : { email, password };
      const data = await request<{ token: string }>(path, null, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onLogin(data.token);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestCode() {
    if (busy) return;
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Ge\u00e7erli bir e-posta adresi girin");
      return;
    }
    setBusy(true);
    try {
      await request("/auth/request-otp", null, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      chooseMode("otp");
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const blueColors = {
    fill: "#2478ed",
    textColor: "#ffffff",
    border: "#1d6bd4",
  };
  const liquidBlob = { color: "#1455b7", size: 76, smoothness: 45 };
  return (
    <main className={"login-page theme-" + settings.theme}>
      <section className="login-shell">
        <div className="login-visual">
          <div className="visual-glow" />
          <img src={settings.imageUrl} alt="Giriş ekranı görseli" />
        </div>
        <div className="login-panel">
          <div className="login-brand">
            <Logo />
            <span>Y&#246;netim Merkezi</span>
          </div>
          <div className="login-heading">
            <h1>Ho&#351; geldiniz</h1>
            <p>
              {mode === "otp"
                ? "E-posta adresine g&#246;nderilen 6 haneli kodu gir."
                : mode === "choose"
                  ? "E-posta adresini yaz, giri&#351; y&#246;ntemini se&#231;."
                  : "E-posta adresin ve &#351;ifrenle giri&#351; yap."}
            </p>
          </div>
          <form className="login-form" onSubmit={submit}>
            <div className="auth-field">
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder=" "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={mode === "otp"}
                required
              />
              <label htmlFor="login-email">E-posta</label>
            </div>
            {mode === "password" ? (
              <div className="auth-field password-wrap">
                <input
                  autoFocus
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder=" "
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <label htmlFor="login-password">&#350;ifre</label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? "\u015eifreyi gizle"
                      : "\u015eifreyi g\u00f6ster"
                  }
                >
                  {showPassword ? "Gizle" : "G\u00f6ster"}
                </button>
              </div>
            ) : mode === "otp" ? (
              <div className="auth-field">
                <input
                  autoFocus
                  id="login-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder=" "
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
                <label htmlFor="login-code">E-posta do&#287;rulama kodu</label>
              </div>
            ) : null}
            <div className="login-error" role="alert">
              {error}
            </div>
            {mode === "choose" ? (
              <div className="login-mode-actions">
                {settings.quickLoginEnabled && (
                  <LiquidCarveButton
                    type="button"
                    label={"H\u0131zl\u0131 Giri\u015f"}
                    ariaLabel="Hizli Giris"
                    colors={blueColors}
                    blob={liquidBlob}
                    rounded={40}
                    padding="16px 24px"
                    className="login-liquid"
                    disabled={busy}
                    onClick={requestCode}
                  />
                )}
                <LiquidCarveButton
                  type="button"
                  label={"Giri\u015f Yap"}
                  ariaLabel="Giris Yap"
                  colors={blueColors}
                  blob={liquidBlob}
                  rounded={40}
                  padding="16px 24px"
                  className="login-liquid"
                  disabled={busy}
                  onClick={() => chooseMode("password")}
                />
              </div>
            ) : (
              <>
                <LiquidCarveButton
                  type="submit"
                  label={
                    busy
                      ? mode === "otp"
                        ? "Do\u011frulaniyor..."
                        : "Giris yapiliyor..."
                      : mode === "otp"
                        ? "Kodu dogrula"
                        : "Giris Yap"
                  }
                  ariaLabel={mode === "otp" ? "Kodu dogrula" : "Giris Yap"}
                  colors={blueColors}
                  blob={liquidBlob}
                  rounded={40}
                  padding="16px 24px"
                  className="login-liquid"
                  disabled={busy}
                />
                <button
                  className="login-back"
                  type="button"
                  onClick={() => chooseMode("choose")}
                  disabled={busy}
                >
                  Geri
                </button>
              </>
            )}
          </form>
          <div className="login-foot">
            <span className="secure-dot" />
            Yalnizca yetkili kullanicilar icindir
          </div>
        </div>
      </section>
    </main>
  );
}
function Layout({
  view,
  setView,
  theme,
  toggleTheme,
  logout,
  children,
}: {
  view: View;
  setView: (v: View) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  logout: () => void;
  children: React.ReactNode;
}) {
  const titles: Record<View, string> = {
    dashboard: "Genel Yönetim",
    new: "Yeni API",
    keys: "API Keys",
    media: "Media",
    manage: "API Y\u00f6netimi",
    settings: "Ayarlar",
  };
  return (
    <div className={`layout admin-theme-${theme}`}>
      <aside className="sidebar">
        <Logo />
        <nav className="nav">
          <Nav
            id="new"
            view={view}
            set={setView}
            icon="+"
            label="Yeni"
            extra="new"
          />
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
        <header className="header">
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
      </main>
    </div>
  );
}
function LoginSettingsPage({token}:{token:string}) {
  const [draft,setDraft]=useState<LoginSettings|null>(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  useEffect(()=>{let cancelled=false;request<LoginSettings>('/admin/login-settings',token).then(value=>{if(!cancelled)setDraft(value)}).catch(e=>{if(!cancelled)setError((e as Error).message)});return()=>{cancelled=true}},[token]);
  async function chooseImage(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];event.target.value='';if(!file||!draft)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('PNG, JPEG veya WebP gorsel secin.');return}
    try { setError(''); const imageUrl=await compressLoginImage(file); setDraft({...draft,imageUrl}) } catch(e) { setError((e as Error).message) }
  }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!draft||saving)return;setSaving(true);setError('');setSaved(false);
    try { const result=await request<LoginSettings>('/admin/login-settings',token,{method:'PATCH',body:JSON.stringify(draft)});setDraft(result);setSaved(true);window.setTimeout(()=>setSaved(false),2200) }
    catch(e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  if(!draft)return <section className="panel settings-loading">{error||'Ayarlar yukleniyor...'}</section>;
  return <form className="settings-page" onSubmit={save}>
    <section className="panel settings-section"><div className="settings-section-heading"><div><div className="eyebrow">G&#246;r&#252;n&#252;m</div><h2>Giri&#351; ekran&#305; g&#246;rseli</h2><p className="muted">Giri&#351; sayfas&#305;n&#305;n sol b&#246;l&#252;m&#252;nde g&#246;sterilecek g&#246;rseli se&#231;in.</p></div></div><div className="image-setting"><div className="image-preview"><img src={draft.imageUrl} alt="Giri&#351; ekrani onizlemesi"/></div><div className="image-actions"><label className="btn" htmlFor="login-image">G&#246;rsel y&#252;kle</label><input id="login-image" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage}/><button type="button" className="btn soft" onClick={()=>setDraft({...draft,imageUrl:'/login-character.jpg'})}>Varsay&#305;lan&#305; kullan</button><span className="muted">PNG, JPEG veya WebP - en fazla 1,3 MB</span></div></div></section>
    <section className="panel settings-section"><div className="settings-section-heading"><div><div className="eyebrow">Renk d&#252;zeni</div><h2>Giri&#351; ekran&#305; temas&#305;</h2><p className="muted">Giri&#351; sayfas&#305;n&#305;n a&#231;&#305;k veya koyu g&#246;r&#252;n&#252;m&#252;n&#252; se&#231;in.</p></div></div><div className="theme-options"><button type="button" className={'theme-option '+(draft.theme==='light'?'selected':'')} onClick={()=>setDraft({...draft,theme:'light'})}><span className="theme-swatch theme-swatch-light"/><span><b>G&#252;nd&#252;z</b><small>A&#231;&#305;k arka plan</small></span>{draft.theme==='light'&&<span className="theme-check">&#10003;</span>}</button><button type="button" className={'theme-option '+(draft.theme==='dark'?'selected':'')} onClick={()=>setDraft({...draft,theme:'dark'})}><span className="theme-swatch theme-swatch-dark"/><span><b>Gece</b><small>Koyu arka plan</small></span>{draft.theme==='dark'&&<span className="theme-check">&#10003;</span>}</button></div></section>
    <section className="panel settings-section quick-setting"><div><div className="eyebrow">Giri&#351; y&#246;ntemi</div><h2>H&#305;zl&#305; giri&#351;</h2><p className="muted">E-posta do&#287;rulama koduyla giri&#351; se&#231;ene&#287;ini g&#246;sterin veya gizleyin.</p></div><button type="button" role="switch" aria-checked={draft.quickLoginEnabled} aria-label="Hizli girisi ac veya kapat" className={'toggle-switch '+(draft.quickLoginEnabled?'on':'')} onClick={()=>setDraft({...draft,quickLoginEnabled:!draft.quickLoginEnabled})}><span/></button></section>
    {error&&<div className="settings-error" role="alert">{error}</div>}
    <div className="settings-save"><span className="muted">{saved?'Ayarlar kaydedildi.':'Degisiklikler giris ekranina uygulanir.'}</span><button className="btn" disabled={saving}>{saving?'Kaydediliyor...':'Degisiklikleri kaydet'}</button></div>
  </form>
}
async function compressLoginImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Gorsel hazirlanamadi.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.84, 0.74, 0.64, 0.54]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= 1_300_000)
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Gorsel okunamadi."));
        reader.onerror = () => reject(new Error("Gorsel okunamadi."));
        reader.readAsDataURL(blob);
      });
  }
  throw new Error("Gorsel 1,3 MB sinirini asiyor; daha kucuk bir dosya secin.");
}
function TrashIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></svg>}
function CopyIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>}
function Dashboard({token,manage}:{token:string;manage:(c:Category)=>void}){
 const [state,setState]=useState<State|null>(null),[mode,setMode]=useState<"grid"|"list">("grid"),[query,setQuery]=useState(""),[copied,setCopied]=useState<number|null>(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState("");
 const load=useCallback(()=>request<State>("/admin/state",token).then(setState),[token]);useEffect(()=>{void load()},[load]);
 const categories=useMemo(()=>(state?.categories||[]).filter(c=>(c.name+" "+c.slug).toLowerCase().includes(query.trim().toLowerCase())),[state,query]);
 if(!state)return <Loading/>;
 const endpoint=(c:Category)=>new URL("/api/categories/"+c.slug,window.location.origin).toString();
 async function copy(c:Category){await navigator.clipboard.writeText(endpoint(c));setCopied(c.id);window.setTimeout(()=>setCopied(x=>x===c.id?null:x),1600)}
 async function remove(c:Category){if(!confirm("\u201c"+c.name+"\u201d kategorisi ve i\u00e7indeki t\u00fcm veriler silinsin mi?"))return;setBusy(true);setActionError("");try{await request("/admin/categories/"+c.id,token,{method:"DELETE"});setState(s=>s?{...s,categories:s.categories.filter(x=>x.id!==c.id)}:s)}catch(e){setActionError((e as Error).message)}finally{setBusy(false)}}
 async function toggle(){setBusy(true);setActionError("");try{const enabled=!state!.enabled;await request("/admin/state",token,{method:"PATCH",body:JSON.stringify({enabled})});setState(s=>s?{...s,enabled}:s)}catch(e){setActionError((e as Error).message)}finally{setBusy(false)}}
 return <div className="dashboard-page">
 <section className="overview-banner dashboard-reveal"><div className="overview-copy"><div className="eyebrow">API Y&#214;NET&#304;M ALANI</div><h2>Kategorileriniz tek yerde</h2><p>Payla&#351;&#305;lan API verilerinizi g&#246;r&#252;nt&#252;leyin ve y&#246;netin.</p></div><div className="service-control"><span className={"service-indicator "+(state.enabled?"is-on":"is-off")}/><div><strong>{state.enabled?"Servis \u00e7al\u0131\u015f\u0131yor":"Servis duraklat\u0131ld\u0131"}</strong><small>Genel API durumu</small></div><button className={"switch "+(state.enabled?"on":"")} disabled={busy} onClick={()=>void toggle()}>{state.enabled?"Durdur":"Ba\u015flat"}</button></div></section>
 <div className="dashboard-stats dashboard-reveal"><div><span className="stat-mark">▦</span><span><small>Kategori</small><strong>{state.categories.length}</strong></span></div><div><span className="stat-mark success">●</span><span><small>Aktif kategori</small><strong>{state.categories.filter(x=>x.active).length}</strong></span></div><div><span className={"stat-mark "+(state.enabled?"success":"muted-mark")}>⌁</span><span><small>Servis durumu</small><strong>{state.enabled?"A\u00e7\u0131k":"Kapal\u0131"}</strong></span></div></div>
 <section className="category-section dashboard-reveal"><div className="category-toolbar"><div><div className="eyebrow">VER&#304; KAYNAKLARI</div><h2>Kategoriler</h2></div><div className="category-tools"><label className="category-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kategori ara"/></label><div className="view-switch"><button className={mode==="grid"?"selected":""} onClick={()=>setMode("grid")} title="Kart g&#246;r&#252;n&#252;m&#252;">▦</button><button className={mode==="list"?"selected":""} onClick={()=>setMode("list")} title="Liste g&#246;r&#252;n&#252;m&#252;">☷</button></div></div></div>
 {categories.length?mode==="grid"?<div className="category-grid">{categories.map((c,i)=><article className="category-card" key={c.id} style={{"--card-index":i} as React.CSSProperties}><div className="category-card-top"><span className="category-glyph">{ "{ }" }</span><span className={"category-status "+(c.active?"":"off")}><i/>{c.active?"Aktif":"Pasif"}</span><button className="icon-button delete-icon" onClick={()=>void remove(c)} title="Kategoriyi sil" aria-label={c.name+" kategorisini sil"} disabled={busy}><TrashIcon/></button></div><h3>{c.name}</h3><div className="endpoint-label">API U&#199; NOKTASI</div><button className="endpoint-copy" onClick={()=>void copy(c)} title="Kopyalamak i&#231;in t&#305;klay&#305;n"><code>{endpoint(c)}</code><span>{copied===c.id?"Kopyaland\u0131":<CopyIcon/>}</span></button><div className="category-card-footer"><span>JSON veri tablosu</span><button className="btn manage-button" onClick={()=>manage(c)}>Y&#246;net <span>→</span></button></div></article>)}</div>
 :<div className="table-wrap category-list-wrap"><table className="table category-list"><thead><tr><th>Kategori</th><th>API u&#231; noktas&#305;</th><th>Durum</th><th>&#304;&#351;lemler</th></tr></thead><tbody>{categories.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td><button className="endpoint-copy list-endpoint" onClick={()=>void copy(c)}><code>{endpoint(c)}</code><span>{copied===c.id?"Kopyaland\u0131":<CopyIcon/>}</span></button></td><td><span className={"category-status "+(c.active?"":"off")}><i/>{c.active?"Aktif":"Pasif"}</span></td><td className="list-actions"><button className="btn manage-button" onClick={()=>manage(c)}>Y&#246;net →</button><button className="icon-button delete-icon" onClick={()=>void remove(c)} title="Kategoriyi sil" aria-label="Kategoriyi sil" disabled={busy}><TrashIcon/></button></td></tr>)}</tbody></table></div>
 :<div className="empty category-empty"><span className="empty-icon">▦</span><h3>{query?"Eşleşen kategori yok":"Henüz kategori yok"}</h3><p>{query?"Arama ifadenizi değiştirip tekrar deneyin.":"İlk veri kategorinizi Yeni bölümünden oluşturabilirsiniz."}</p></div>}{actionError&&<div className="manager-error" role="alert">{actionError}</div>}</section></div>
}
function CategoryManager({token,category,back}:{token:string;category:Category;back:()=>void}){
 const [schema,setSchema]=useState<Schema|null>(null),[error,setError]=useState(""),[columnName,setColumnName]=useState(""),[adding,setAdding]=useState(false),[edit,setEdit]=useState<{rowId:string;columnId:number}|null>(null),[value,setValue]=useState(""),[saving,setSaving]=useState<string|null>(null);
 const load=useCallback(()=>request<Schema>("/admin/categories/"+category.id+"/schema",token).then(setSchema).catch(e=>setError(e.message)),[token,category.id]);useEffect(()=>{void load()},[load]);if(!schema)return <Loading/>;
 async function addColumn(e:FormEvent<HTMLFormElement>){e.preventDefault();const name=columnName.trim();if(!name||adding)return;setAdding(true);setError("");try{const col=await request<Column>("/admin/categories/"+category.id+"/columns",token,{method:"POST",body:JSON.stringify({name,fieldType:"text"})});setSchema(current=>current?{...current,columns:[...current.columns,col]}:current);setColumnName("")}catch(x){setError((x as Error).message)}finally{setAdding(false)}}
 async function addRow(){try{const result=await request<{id:string}>("/admin/categories/"+category.id+"/rows",token,{method:"POST",body:JSON.stringify({data:{},active:true})});const row:DataRow={id:result.id,data:{},active:true};setSchema(current=>current?{...current,rows:[row,...current.rows]}:current);if(schema?.columns[0])startEdit(row,schema.columns[0])}catch(x){setError((x as Error).message)}}
 function startEdit(row:DataRow,col:Column){setEdit({rowId:row.id,columnId:col.id});setValue(row.data[String(col.id)]||"")}
 async function saveCell(row:DataRow,col:Column){const k=String(col.id),v=value;setEdit(null);if((row.data[k]||"")===v)return;setSaving(row.id+":"+k);const data={...row.data,[k]:v};try{await request("/admin/categories/"+category.id+"/rows/"+row.id,token,{method:"PATCH",body:JSON.stringify({data,active:row.active})});setSchema(s=>s?{...s,rows:s.rows.map(r=>r.id===row.id?{...r,data}:r)}:s)}catch(x){setError((x as Error).message)}finally{setSaving(null)}}
 async function removeColumn(col:Column){if(!confirm("\u201c"+col.name+"\u201d s\u00fctunu ve i\u00e7indeki de\u011ferleri silmek istiyor musunuz?"))return;try{await request("/admin/categories/"+category.id+"/columns/"+col.id,token,{method:"DELETE"});setSchema(current=>current?{...current,columns:current.columns.filter(c=>c.id!==col.id),rows:current.rows.map(r=>{const data={...r.data};delete data[String(col.id)];return {...r,data}})}:current)}catch(x){setError((x as Error).message)}}
 async function removeRow(row:DataRow){if(!confirm("Bu veri satırı silinsin mi?"))return;try{await request("/admin/categories/"+category.id+"/rows/"+row.id,token,{method:"DELETE"});setSchema(current=>current?{...current,rows:current.rows.filter(r=>r.id!==row.id)}:current)}catch(x){setError((x as Error).message)}}
 async function toggleRow(row:DataRow){try{await request("/admin/categories/"+category.id+"/rows/"+row.id,token,{method:"PATCH",body:JSON.stringify({data:row.data,active:!row.active})});setSchema(current=>current?{...current,rows:current.rows.map(r=>r.id===row.id?{...r,active:!r.active}:r)}:current)}catch(x){setError((x as Error).message)}}
 return <div className="manager-page"><div className="manager-top manager-hero"><button className="btn soft" onClick={back}>&larr; Geri</button><div className="manager-title"><div className="eyebrow">KATEGOR&#304; TABLOSU</div><h2>{schema.category.name}</h2><code>GET /api/categories/{schema.category.slug}</code></div><button className={"switch "+(schema.category.active?"on":"")} onClick={async()=>{const active=!schema.category.active;try{await request("/admin/categories/"+category.id,token,{method:"PATCH",body:JSON.stringify({active})});setSchema(current=>current?{...current,category:{...current.category,active}}:current)}catch(x){setError((x as Error).message)}}}>{schema.category.active?"API a\u00e7\u0131k":"API kapal\u0131"}</button></div>
 <section className="panel schema-panel spreadsheet-panel"><div className="spreadsheet-heading"><div><div className="eyebrow">VER&#304;TABANI G&#214;R&#220;N&#220;M&#220;</div><h2>{schema.category.name} <span>tablosu</span></h2><p>H&#252;creyi d&#252;zenlemek i&#231;in &#231;ift t&#305;klay&#305;n. De&#287;i&#351;iklikler kaydedilince API verisine yans&#305;r.</p></div><div className="table-count"><strong>{schema.rows.length}</strong><span>sat&#305;r</span><i/><strong>{schema.columns.length}</strong><span>s&#252;tun</span></div></div>
 <div className="table-tools"><form className="column-add" onSubmit={addColumn}><input value={columnName} onChange={e=>setColumnName(e.target.value)} placeholder="Yeni s&#252;tun ad&#305; (&ouml;rn. &#220;lke kodu)" aria-label="Yeni s&#252;tun ad&#305;"/><button className="btn soft" disabled={!columnName.trim()||adding}>{adding?"Ekleniyor&#8230;":"+ S&#252;tun ekle"}</button></form><button className="btn" onClick={()=>void addRow()} disabled={!schema.columns.length}>＋ Sat&#305;r ekle</button></div>
 {schema.columns.length?<div className="table-wrap spreadsheet-wrap"><table className="table spreadsheet"><thead><tr><th className="row-number-head">#</th>{schema.columns.map(col=><th key={col.id}><span>{col.name}</span><button className="icon-button column-delete" onClick={()=>void removeColumn(col)} title="S&#252;tunu sil" aria-label={"S&#252;tunu sil: "+col.name}><TrashIcon/></button></th>)}<th>Durum</th><th className="row-action-head"/></tr></thead><tbody>{schema.rows.map((row,i)=><tr key={row.id}><td className="row-number">{i+1}</td>{schema.columns.map(col=>{const k=row.id+":"+col.id,isEditing=edit?.rowId===row.id&&edit.columnId===col.id;return <td key={col.id} className={"spreadsheet-cell "+(saving===k?"cell-saving":"")} onDoubleClick={()=>startEdit(row,col)} title="D&#252;zenlemek i&#231;in &#231;ift t&#305;klay&#305;n">{isEditing?<input autoFocus className="cell-editor" value={value} onChange={e=>setValue(e.target.value)} onBlur={()=>void saveCell(row,col)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur()}}}/>:<span className={!row.data[String(col.id)]?"cell-placeholder":""}>{row.data[String(col.id)]||"—"}</span>}</td>})}<td><button className={"switch compact "+(row.active?"on":"")} onClick={()=>void toggleRow(row)}>{row.active?"Aktif":"Kapal\u0131"}</button></td><td className="row-action-cell"><button className="icon-button delete-icon" onClick={()=>void removeRow(row)} title="Sat&#305;r&#305; sil" aria-label="Sat&#305;r&#305; sil"><TrashIcon/></button></td></tr>)}</tbody></table>{!schema.rows.length&&<div className="table-empty-state"><span>Hen&#252;z sat&#305;r yok</span><small>Tabloya ilk verinizi ekleyin.</small></div>}</div>:<div className="table-empty-state no-columns"><span>Tablo hen&#252;z olu&#351;turulmad&#305;</span><small>&#214;nce bir s&#252;tun ekleyin; &#246;rne&#287;in &#220;lke, &#220;lke kodu veya Vergi dairesi.</small></div>}
 <div className="spreadsheet-footer"><span><i className="save-dot"/> Bu kategoriye ba&#287;l&#305; kaydediliyor</span><span>&#199;ift t&#305;klay&#305;n · Enter ile kaydedin</span></div></section>{error&&<div className="manager-error" role="alert">{error}</div>}</div>
}
function NewApi({ token, done }: { token: string; done: () => void }) {
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await request("/admin/categories", token, {
        method: "POST",
        body: JSON.stringify({ name: f.get("name"), slug: f.get("slug") }),
      });
      done();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">API üretim alanı</div>
          <h2>Yeni kategori oluştur</h2>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <Field
          label="Kategori adı"
          name="name"
          placeholder="Örn. Lokasyonlar"
        />
        <Field label="Endpoint adresi" name="slug" placeholder="lokasyonlar" />
        <div className="error">{error}</div>
        <div>
          <button className="btn">API kategorisini oluştur</button>
        </div>
      </form>
    </section>
  );
}
function Keys({ token }: { token: string }) {
  const [rows, setRows] = useState<ApiKey[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [creating, setCreating] = useState(false);
  const load = useCallback(
    () =>
      Promise.all([
        request<ApiKey[]>("/admin/api-keys", token),
        request<Category[]>("/admin/categories", token),
      ]).then(([k, c]) => {
        setRows(k);
        setCategories(c);
      }),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      categoryIds = f.getAll("categoryIds").map(Number);
    await request("/admin/api-keys", token, {
      method: "POST",
      body: JSON.stringify({ projectName: f.get("projectName"), categoryIds }),
    });
    setCreating(false);
    load();
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Proje erişimleri</div>
          <h2>API anahtarları</h2>
        </div>
        <button className="btn" onClick={() => setCreating((v) => !v)}>
          ＋ Yeni anahtar
        </button>
      </div>
      {creating && (
        <form className="key-create" onSubmit={create}>
          <Field
            label="Proje / site adı"
            name="projectName"
            placeholder="Örn. Anypay Tahsilat"
          />
          <div>
            <label className="field-title">Kullanabileceği API’ler</label>
            <div className="check-grid">
              {categories.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" name="categoryIds" value={c.id} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn">Anahtar oluştur</button>
        </form>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Proje</th>
              <th>İzin verilen API’ler</th>
              <th>API Key</th>
              <th>Site</th>
              <th>İstek</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <b>{x.projectName}</b>
                </td>
                <td>
                  <div className="tag-list">
                    {x.categoryNames.map((n) => (
                      <span key={n}>{n}</span>
                    ))}
                  </div>
                </td>
                <td className="key">
                  <span>{x.apiKey}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(x.apiKey)}
                  >
                    Kopyala
                  </button>
                </td>
                <td>{x.siteCount}</td>
                <td>{x.usageCount}</td>
                <td>
                  <button
                    className={"switch compact " + (x.active ? "on" : "")}
                    onClick={async () => {
                      await request(`/admin/api-keys/${x.id}`, token, {
                        method: "PATCH",
                        body: JSON.stringify({ active: !x.active }),
                      });
                      load();
                    }}
                  >
                    {x.active ? "Açık" : "Kapalı"}
                  </button>
                </td>
                <td>
                  <button
                    className="text-danger"
                    onClick={async () => {
                      if (confirm("Anahtar silinsin mi?")) {
                        await request(`/admin/api-keys/${x.id}`, token, {
                          method: "DELETE",
                        });
                        load();
                      }
                    }}
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function MediaPage({ token }: { token: string }) {
  const [rows, setRows] = useState<Media[]>([]);
  const load = useCallback(
    () => request<Media[]>("/admin/media", token).then(setRows),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Dosya galerisi</div>
          <h2>Yüklenen medyalar</h2>
        </div>
        <button
          className="btn"
          onClick={async () => {
            const name = prompt("Dosya adı"),
              url = name && prompt("Dosya URL adresi");
            if (name && url) {
              await request("/admin/media", token, {
                method: "POST",
                body: JSON.stringify({ name, url, mimeType: "image" }),
              });
              load();
            }
          }}
        >
          Medya ekle
        </button>
      </div>
      <div className="media-grid">
        {rows.map((x) => (
          <article className="card media" key={x.id}>
            <img src={x.url} alt="" />
            <div className="media-body">
              <b>{x.name}</b>
              <p className="muted">{x.mimeType}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function Field({
  label,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" required {...props} />
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      Güzel <i>Teknoloji</i>
    </div>
  );
}
function Nav({
  id,
  view,
  set,
  icon,
  label,
  extra = "",
}: {
  id: View;
  view: View;
  set: (v: View) => void;
  icon: string;
  label: string;
  extra?: string;
}) {
  return (
    <button
      className={(view === id ? "active " : "") + extra}
      onClick={() => set(id)}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
function Loading() {
  return <div className="empty">Yükleniyor…</div>;
}
