import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, ImagePlus, LockKeyhole, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { request } from "../../shared/api";
import type { LoginSettings } from "../../shared/types";

export default function Settings({ token }: { token: string }) {
  const [tab, setTab] = useState("login");
  const [draft, setDraft] = useState<LoginSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    request<LoginSettings>("/admin/login-settings", token)
      .then(value => { if (!cancelled) setDraft(value); })
      .catch(reason => { if (!cancelled) setError((reason as Error).message); });
    return () => { cancelled = true; };
  }, [token]);

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("PNG, JPEG veya WebP görsel seçin."); return; }
    try { setError(""); setSaved(false); setDraft({ ...draft, imageUrl: await compressLoginImage(file) }); }
    catch (reason) { setError((reason as Error).message); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const result = await request<LoginSettings>("/admin/login-settings", token, { method: "PATCH", body: JSON.stringify(draft) });
      setDraft(result); setSaved(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  return <div className="settings-page">
    <div className="settings-heading"><span className="settings-kicker">YÖNETİM MERKEZİ</span><h1>Ayarlar</h1><p>Panel tercihlerini ve giriş deneyimini buradan yönetin.</p></div>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Ayar bölümleri"><span className="settings-tabs-caption">BÖLÜMLER</span><button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")} aria-current={tab === "login" ? "page" : undefined}><LockKeyhole size={18} /><span>Giriş ekranı<small>Görsel ve giriş yöntemi</small></span></button></nav>
      <form className="settings-content" onSubmit={save}>
        <div className="settings-content-heading"><div className="settings-content-icon"><LockKeyhole size={20} /></div><div><h2>Giriş ekranı</h2><p>Yöneticilerin gördüğü giriş sayfasını düzenleyin.</p></div></div>
        {!draft ? <div className="settings-loading">{error || "Ayarlar yükleniyor..."}</div> : <>
          <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><ImagePlus size={19} /></span><div><h3>Karşılama görseli</h3><p>Giriş ekranının sol bölümünde görünür.</p></div></div><div className="settings-image-layout"><div className="settings-image-preview"><img src={draft.imageUrl} alt="Giriş ekranı görseli önizlemesi" /></div><div className="settings-image-actions"><strong>Görseli özelleştir</strong><p>PNG, JPEG veya WebP yükleyin. Görsel otomatik olarak küçültülür.</p><div><label className="settings-button settings-button-primary" htmlFor="login-image"><ImagePlus size={16} /> Görsel yükle</label><input id="login-image" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} /><button type="button" className="settings-button" onClick={() => { setDraft({ ...draft, imageUrl: "/login-character.jpg" }); setSaved(false); }}><RotateCcw size={16} /> Varsayılana dön</button></div><small>En fazla 1,3 MB · Önerilen oran 4:5</small></div></div></section>
          <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><ShieldCheck size={19} /></span><div><h3>Giriş yöntemleri</h3><p>Yöneticinin kullanabileceği oturum açma seçenekleri.</p></div></div><div className="settings-method-row"><div><strong>E-posta koduyla hızlı giriş</strong><p>Tek kullanımlık doğrulama kodunu yönetici e-postasına gönderir.</p></div><button type="button" role="switch" aria-checked={draft.quickLoginEnabled} aria-label="E-posta koduyla hızlı girişi aç veya kapat" className={`settings-switch ${draft.quickLoginEnabled ? "on" : ""}`} onClick={() => { setDraft({ ...draft, quickLoginEnabled: !draft.quickLoginEnabled }); setSaved(false); }}><span /></button></div><div className="settings-method-note"><Check size={16} /> Şifreyle giriş her zaman kullanılabilir.</div></section>
          <div className="settings-save"><div role="status">{error ? <span className="settings-error">{error}</span> : saved ? <span className="settings-success"><Check size={16} /> Ayarlar kaydedildi.</span> : <span>Değişiklikler kaydettikten sonra giriş ekranına uygulanır.</span>}</div><button className="settings-button settings-button-primary" disabled={saving}><Save size={16} /> {saving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}</button></div>
        </>}
      </form>
    </div>
  </div>;
}

async function compressLoginImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Görsel hazırlanamadı.");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  for (const quality of [0.84, 0.74, 0.64, 0.54]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 1_300_000) return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Görsel okunamadı."));
      reader.onerror = () => reject(new Error("Görsel okunamadı."));
      reader.readAsDataURL(blob);
    });
  }
  throw new Error("Görsel 1,3 MB sınırını aşıyor; daha küçük bir dosya seçin.");
}
