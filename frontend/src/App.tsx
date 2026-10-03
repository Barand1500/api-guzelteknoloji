import {
  FormEvent,
  useCallback,
  useEffect,
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
    [selected, setSelected] = useState<Category | null>(null);
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
  logout,
  children,
}: {
  view: View;
  setView: (v: View) => void;
  logout: () => void;
  children: React.ReactNode;
}) {
  const titles: Record<View, string> = {
    dashboard: "Dashboard",
    new: "Yeni API",
    keys: "API Keys",
    media: "Media",
    manage: "API Y\u00f6netimi",
    settings: "Ayarlar",
  };
  return (
    <div className="layout">
      <aside className="sidebar">
        <Logo />
        <nav className="nav">
          <Nav
            id="dashboard"
            view={view}
            set={setView}
            icon={"\u25a6"}
            label="Dashboard"
          />
          <Nav
            id="new"
            view={view}
            set={setView}
            icon="+"
            label="Yeni"
            extra="new"
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
          <button className="btn soft" onClick={logout}>
            C&#305;k&#305;&#351;
          </button>
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
function Dashboard({
  token,
  manage,
}: {
  token: string;
  manage: (c: Category) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const load = useCallback(
    () => request<State>("/admin/state", token).then(setState),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!state) return <Loading />;
  return (
    <>
      <div className="actions spread">
        <span className={"badge " + (state.enabled ? "" : "off")}>
          ● {state.enabled ? "API aktif" : "API kapalı"}
        </span>
        <button
          className="btn soft"
          onClick={async () => {
            await request("/admin/state", token, {
              method: "PATCH",
              body: JSON.stringify({ enabled: !state.enabled }),
            });
            load();
          }}
        >
          {state.enabled ? "Servisi kapat" : "Servisi aç"}
        </button>
      </div>
      <section className="cards">
        {state.categories.length ? (
          state.categories.map((c) => (
            <article className="card api-card" key={c.id}>
              <div className="icon">{"{ }"}</div>
              <h3>{c.name}</h3>
              <code>/api/categories/{c.slug}</code>
              <footer>
                <span className={"badge " + (c.active ? "" : "off")}>
                  {c.active ? "Aktif" : "Kapalı"}
                </span>
                <button className="btn soft" onClick={() => manage(c)}>
                  Yönet
                </button>
              </footer>
            </article>
          ))
        ) : (
          <div className="empty">
            <h3>Henüz API kategorisi yok</h3>
            <p>Soldaki “Yeni” alanından ilk API kategorinizi oluşturun.</p>
          </div>
        )}
      </section>
    </>
  );
}
function CategoryManager({
  token,
  category,
  back,
}: {
  token: string;
  category: Category;
  back: () => void;
}) {
  const [schema, setSchema] = useState<Schema | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<DataRow | null>(null);
  const load = useCallback(
    () =>
      request<Schema>(`/admin/categories/${category.id}/schema`, token)
        .then(setSchema)
        .catch((e) => setError(e.message)),
    [token, category.id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!schema) return <Loading />;
  async function addColumn() {
    const name = prompt("Yeni sütunun adı");
    if (name) {
      await request(`/admin/categories/${category.id}/columns`, token, {
        method: "POST",
        body: JSON.stringify({ name, fieldType: "text" }),
      });
      load();
    }
  }
  async function saveRow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form),
      data = Object.fromEntries(
        schema!.columns.map((c) => [
          String(c.id),
          String(f.get(String(c.id)) || ""),
        ]),
      );
    await request(
      `/admin/categories/${category.id}/rows${editing ? `/${editing.id}` : ""}`,
      token,
      {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ data, active: true }),
      },
    );
    setEditing(null);
    form.reset();
    load();
  }
  return (
    <>
      <div className="manager-top">
        <button className="btn soft" onClick={back}>
          ← Geri
        </button>
        <div>
          <h2>{schema.category.name}</h2>
          <code>GET /api/categories/{schema.category.slug}</code>
        </div>
        <button
          className={"switch " + (schema.category.active ? "on" : "")}
          onClick={async () => {
            await request(`/admin/categories/${category.id}`, token, {
              method: "PATCH",
              body: JSON.stringify({ active: !schema.category.active }),
            });
            load();
          }}
        >
          {schema.category.active ? "API açık" : "API kapalı"}
        </button>
      </div>
      <section className="panel schema-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Tablo yapısı</div>
            <h2>Veriler</h2>
          </div>
          <button className="btn soft" onClick={addColumn}>
            ＋ Sütun ekle
          </button>
        </div>
        {schema.columns.length === 0 ? (
          <div className="empty small">
            <h3>Önce sütun ekleyin</h3>
            <p>
              Örneğin “İl”, “İlçe”, “Vergi Dairesi” veya “BIN” sütunlarını
              oluşturabilirsiniz.
            </p>
          </div>
        ) : (
          <>
            <form
              key={editing?.id || "new"}
              className="row-form"
              onSubmit={saveRow}
            >
              {schema.columns.map((c) => (
                <label key={c.id}>
                  <span>{c.name}</span>
                  <input
                    name={String(c.id)}
                    defaultValue={editing?.data[String(c.id)] || ""}
                  />
                </label>
              ))}
              <button className="btn">
                {editing ? "Kaydı güncelle" : "Satır ekle"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="btn soft"
                  onClick={() => setEditing(null)}
                >
                  İptal
                </button>
              )}
            </form>
            <div className="table-wrap">
              <table className="table data-table">
                <thead>
                  <tr>
                    {schema.columns.map((c) => (
                      <th key={c.id}>
                        {c.name}
                        <button
                          title="Sütunu sil"
                          onClick={async () => {
                            if (confirm(`${c.name} sütunu silinsin mi?`)) {
                              await request(
                                `/admin/categories/${category.id}/columns/${c.id}`,
                                token,
                                { method: "DELETE" },
                              );
                              load();
                            }
                          }}
                        >
                          ×
                        </button>
                      </th>
                    ))}
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.rows.map((row) => (
                    <tr key={row.id}>
                      {schema.columns.map((c) => (
                        <td key={c.id}>{row.data[String(c.id)] || "—"}</td>
                      ))}
                      <td>
                        <span className={"badge " + (row.active ? "" : "off")}>
                          {row.active ? "Aktif" : "Kapalı"}
                        </span>
                      </td>
                      <td className="row-actions">
                        <button onClick={() => setEditing(row)}>Düzenle</button>
                        <button
                          className="danger"
                          onClick={async () => {
                            if (confirm("Bu satır silinsin mi?")) {
                              await request(
                                `/admin/categories/${category.id}/rows/${row.id}`,
                                token,
                                { method: "DELETE" },
                              );
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
              {!schema.rows.length && (
                <p className="muted table-empty">Henüz veri eklenmedi.</p>
              )}
            </div>
          </>
        )}
      </section>
      <div className="error">{error}</div>
    </>
  );
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
