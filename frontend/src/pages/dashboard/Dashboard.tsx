import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Ellipsis,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { request } from "../../shared/api";
import { NavIcon } from "../../shared/NavIcon";
import type { Category, State } from "../../shared/types";
import { Loading } from "../../shared/ui";

const iconChoices = [
  { id: "code", label: "Kod" },
  { id: "home", label: "Ev" },
  { id: "briefcase", label: "Çanta" },
  { id: "pulse", label: "Nabız" },
  { id: "pay", label: "Ödeme" },
  { id: "chart", label: "Grafik" },
  { id: "sliders", label: "Ayar" },
  { id: "gear", label: "Çark" },
];

export default function Dashboard({
  token,
  manage,
  create,
}: {
  token: string;
  manage: (category: Category) => void;
  create: () => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);
  const [iconPicker, setIconPicker] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const load = useCallback(
    () => request<State>("/admin/state", token).then(setState),
    [token],
  );
  useEffect(() => {
    void load().catch((reason) => setError((reason as Error).message));
  }, [load]);
  useEffect(() => {
    if (confirmStop && modalRef.current)
      gsap.fromTo(
        modalRef.current,
        { autoAlpha: 0, y: 20, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: "power3.out" },
      );
  }, [confirmStop]);
  useEffect(() => {
    if (!cardsRef.current) return;
    const cards = cardsRef.current.querySelectorAll(".dash-category-card");
    gsap.fromTo(
      cards,
      { autoAlpha: 0, y: 14 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.42,
        stagger: 0.055,
        ease: "power2.out",
      },
    );
  }, [state?.categories.length]);
  const categories = useMemo(
    () =>
      (state?.categories || []).filter((category) =>
        `${category.name} ${category.slug}`
          .toLocaleLowerCase("tr-TR")
          .includes(query.trim().toLocaleLowerCase("tr-TR")),
      ),
    [state, query],
  );

  async function copy(category: Category) {
    await navigator.clipboard.writeText(
      new URL(
        `/api/categories/${category.slug}`,
        window.location.origin,
      ).toString(),
    );
    setCopied(category.id);
    window.setTimeout(
      () => setCopied((current) => (current === category.id ? null : current)),
      1700,
    );
  }
  async function remove(category: Category) {
    setMenu(null);
    if (
      !window.confirm(
        `“${category.name}” kategorisi ve içindeki tüm kayıtlar silinsin mi?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/categories/${category.id}`, token, {
        method: "DELETE",
      });
      setState((current) =>
        current
          ? {
              ...current,
              categories: current.categories.filter(
                (item) => item.id !== category.id,
              ),
            }
          : current,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setService(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      await request("/admin/state", token, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setState((current) => (current ? { ...current, enabled } : current));
      setConfirmStop(false);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setIcon(category: Category, icon: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/admin/categories/${category.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ icon }),
      });
      setState((current) =>
        current
          ? {
              ...current,
              categories: current.categories.map((item) =>
                item.id === category.id ? { ...item, icon } : item,
              ),
            }
          : current,
      );
      setIconPicker(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!state) return <Loading />;

  return (
    <div className="dashboard-page">
      <div className="dash-heading">
        <div>
          <h1>Genel Yönetim</h1>
          <p>Kategorilerinizi ve API servisinizin durumunu yönetin.</p>
        </div>
        <div
          className={`dash-service ${state.enabled ? "running" : "stopped"}`}
        >
          <span className="dash-service-dot" />
          <div>
            <strong>
              {state.enabled ? "Servis çalışıyor" : "Servis duraklatıldı"}
            </strong>
            <small>Genel API durumu</small>
          </div>
          <button
            className={state.enabled ? "stop" : "start"}
            disabled={busy}
            onClick={() =>
              state.enabled ? setConfirmStop(true) : void setService(true)
            }
          >
            {state.enabled ? "Durdur" : "Başlat"}
          </button>
        </div>
      </div>
      <section className="dash-section">
        <div className="dash-toolbar">
          <div>
            <h2>Kategoriler</h2>
            <span>{state.categories.length} kategori</span>
          </div>
          <div className="dash-toolbar-actions">
            <label className="dash-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Kategori ara"
                aria-label="Kategori ara"
              />
            </label>
            <button className="dash-add" onClick={create}>
              <Plus size={17} /> Yeni kategori
            </button>
          </div>
        </div>
        {categories.length ? (
          <div className="dash-category-grid" ref={cardsRef}>
            {categories.map((category) => (
              <article className="dash-category-card" key={category.id}>
                <div className="dash-card-top">
                  <div className="dash-icon-wrap">
                    <button
                      className="dash-icon"
                      onClick={() => {
                        setIconPicker((current) =>
                          current === category.id ? null : category.id,
                        );
                        setMenu(null);
                      }}
                      title="Kategori ikonunu değiştir"
                      aria-label={`${category.name} ikonunu değiştir`}
                    >
                      <NavIcon name={category.icon || "code"} size={23} />
                    </button>
                    {iconPicker === category.id && (
                      <div className="dash-icon-picker">
                        <div className="dash-popover-heading">İkon seç</div>
                        <div>
                          {iconChoices.map((choice) => (
                            <button
                              key={choice.id}
                              className={
                                (category.icon || "code") === choice.id
                                  ? "selected"
                                  : ""
                              }
                              onClick={() => void setIcon(category, choice.id)}
                              disabled={busy}
                              title={choice.label}
                              aria-label={choice.label}
                            >
                              <NavIcon name={choice.id} size={19} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <span
                    className={`dash-status ${category.active ? "active" : "inactive"}`}
                  >
                    <i />
                    {category.active ? "Aktif" : "Pasif"}
                  </span>
                  <div className="dash-card-menu-wrap">
                    <button
                      className="dash-more"
                      onClick={() => {
                        setMenu((current) =>
                          current === category.id ? null : category.id,
                        );
                        setIconPicker(null);
                      }}
                      title="Diğer işlemler"
                      aria-label={`${category.name} diğer işlemler`}
                    >
                      <Ellipsis size={19} />
                    </button>
                    {menu === category.id && (
                      <div className="dash-card-menu">
                        <button
                          disabled={busy}
                          onClick={() => void remove(category)}
                        >
                          <Trash2 size={15} /> Kategoriyi sil
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="dash-card-body">
                  <h3 title={category.name}>{category.name}</h3>
                  <p>API veri kaynağı</p>
                </div>
                <div className="dash-card-endpoint">
                  <span>API ADRESİ</span>
                  <button
                    onClick={() => void copy(category)}
                    title="API adresini kopyala"
                  >
                    <code>/api/categories/{category.slug}</code>
                    {copied === category.id ? (
                      <Check size={16} />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
                <div className="dash-card-footer">
                  <button onClick={() => manage(category)}>
                    Kategoriyi yönet <ArrowRight size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="dash-empty">
            <NavIcon name="code" size={29} />
            <h3>{query ? "Eşleşen kategori yok" : "Henüz kategori yok"}</h3>
            <p>
              {query
                ? "Başka bir arama deneyin."
                : "İlk kategorinizi oluşturarak başlayın."}
            </p>
            {!query && (
              <button onClick={create}>
                <Plus size={16} /> Kategori oluştur
              </button>
            )}
          </div>
        )}
      </section>
      {error && (
        <div className="dash-error" role="alert">
          {error}
        </div>
      )}
      {confirmStop && (
        <div
          className="dash-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmStop(false);
          }}
        >
          <div
            className="dash-confirm-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dash-stop-title"
          >
            <button
              className="dash-modal-close"
              onClick={() => setConfirmStop(false)}
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
            <div className="dash-modal-icon">
              <ShieldAlert size={24} />
            </div>
            <h2 id="dash-stop-title">API servisini durdur?</h2>
            <p>
              Servis durduğunda dış uygulamalar kategori verilerine erişemez.
              İstediğiniz zaman yeniden başlatabilirsiniz.
            </p>
            <div className="dash-modal-actions">
              <button className="cancel" onClick={() => setConfirmStop(false)}>
                Vazgeç
              </button>
              <button
                className="confirm"
                disabled={busy}
                onClick={() => void setService(false)}
              >
                {busy ? "Durduruluyor..." : "Evet, durdur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
