import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, ImagePlus, KeyRound, LockKeyhole, Mail, RotateCcw, Save, Send, ShieldCheck } from "lucide-react";
import { request } from "../../shared/api";
import type { LoginSettings, SmtpSettings } from "../../shared/types";
import "./settings.css";

type Tab = "login" | "smtp";
type SmtpDraft = Omit<SmtpSettings, "passwordConfigured" | "encryptionKeyConfigured">;

export default function Settings({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>("login");
  const [draft, setDraft] = useState<LoginSettings | null>(null);
  const [smtpDraft, setSmtpDraft] = useState<SmtpDraft | null>(null);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordConfigured, setSmtpPasswordConfigured] = useState(false);
  const [encryptionKeyConfigured, setEncryptionKeyConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [error, setError] = useState("");
  const [smtpError, setSmtpError] = useState("");
  const [saved, setSaved] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    request<LoginSettings>("/admin/login-settings", token)
      .then(value => { if (!cancelled) setDraft(value); })
      .catch(reason => { if (!cancelled) setError((reason as Error).message); });
    request<SmtpSettings>("/admin/smtp-settings", token)
      .then(value => {
        if (cancelled) return;
        const { passwordConfigured, encryptionKeyConfigured: hasEncryptionKey, ...values } = value;
        setSmtpDraft(values);
        setSmtpPasswordConfigured(passwordConfigured);
        setEncryptionKeyConfigured(hasEncryptionKey);
      })
      .catch(reason => { if (!cancelled) setSmtpError((reason as Error).message); });
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

  async function saveLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const result = await request<LoginSettings>("/admin/login-settings", token, { method: "PATCH", body: JSON.stringify(draft) });
      setDraft(result); setSaved(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function saveSmtp(sendTest: boolean) {
    if (!smtpDraft || smtpSaving || smtpTesting) return;
    setSmtpSaving(true); setSmtpError(""); setSmtpSaved(false); setSmtpTested(false);
    try {
      const result = await request<SmtpSettings>("/admin/smtp-settings", token, {
        method: "PATCH",
        body: JSON.stringify({ ...smtpDraft, password: smtpPassword }),
      });
      const { passwordConfigured, encryptionKeyConfigured: hasEncryptionKey, ...values } = result;
      setSmtpDraft(values);
      setSmtpPassword("");
      setSmtpPasswordConfigured(passwordConfigured);
      setEncryptionKeyConfigured(hasEncryptionKey);
      setSmtpSaved(true);
      if (sendTest) {
        setSmtpSaving(false);
        setSmtpTesting(true);
        const test = await request<{ sentTo: string }>("/admin/smtp-settings/test", token, { method: "POST" });
        setSmtpError(`Test e-postası ${test.sentTo} adresine gönderildi.`);
        setSmtpTested(true);
      }
    } catch (reason) {
      setSmtpError((reason as Error).message);
    } finally {
      setSmtpSaving(false);
      setSmtpTesting(false);
    }
  }

  return <div className="settings-page">
    <div className="settings-heading"><h1>Ayarlar</h1><p>Giriş güvenliğini ve yönetim paneli e-posta hizmetini yapılandırın.</p></div>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Ayar bölümleri">
        <span className="settings-tabs-caption">BÖLÜMLER</span>
        <button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")} aria-current={tab === "login" ? "page" : undefined}><LockKeyhole size={18} /><span>Giriş ve Güvenlik</span></button>
        <button className={tab === "smtp" ? "active" : ""} onClick={() => setTab("smtp")} aria-current={tab === "smtp" ? "page" : undefined}><Mail size={18} /><span>E-posta/SMTP Ayarları</span></button>
      </nav>
      {tab === "login" ? <form className="settings-content" onSubmit={saveLogin}>
        <div className="settings-content-heading"><div className="settings-content-icon"><LockKeyhole size={20} /></div><div><h2>Giriş ve Güvenlik</h2><p>Yöneticilerin gördüğü giriş sayfasını ve oturum açma yöntemlerini düzenleyin.</p></div></div>
        {!draft ? <div className="settings-loading">{error || "Ayarlar yükleniyor..."}</div> : <>
          <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><ImagePlus size={19} /></span><div><h3>Karşılama görseli</h3><p>Giriş ekranının sol bölümünde görünür.</p></div></div><div className="settings-image-layout"><div className="settings-image-preview"><img src={draft.imageUrl} alt="Giriş ekranı görseli önizlemesi" /></div><div className="settings-image-actions"><strong>Görseli özelleştir</strong><p>PNG, JPEG veya WebP yükleyin. Görsel otomatik olarak küçültülür.</p><div><label className="settings-button settings-button-primary" htmlFor="login-image"><ImagePlus size={16} /> Görsel yükle</label><input id="login-image" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} /><button type="button" className="settings-button" onClick={() => { setDraft({ ...draft, imageUrl: "/login-character.jpg" }); setSaved(false); }}><RotateCcw size={16} /> Varsayılana dön</button></div><small>En fazla 1,3 MB · Önerilen oran 4:5</small></div></div></section>
          <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><ShieldCheck size={19} /></span><div><h3>Giriş yöntemleri</h3><p>Yöneticinin kullanabileceği oturum açma seçenekleri.</p></div></div><div className="settings-method-row"><div><strong>E-posta koduyla hızlı giriş</strong><p>Tek kullanımlık doğrulama kodunu yönetici e-postasına gönderir.</p></div><button type="button" role="switch" aria-checked={draft.quickLoginEnabled} aria-label="E-posta koduyla hızlı girişi aç veya kapat" className={`settings-switch ${draft.quickLoginEnabled ? "on" : ""}`} onClick={() => { setDraft({ ...draft, quickLoginEnabled: !draft.quickLoginEnabled }); setSaved(false); }}><span /></button></div><div className="settings-method-note"><Check size={16} /> Şifreyle giriş her zaman kullanılabilir.</div></section>
          <div className="settings-save"><div role="status">{error ? <span className="settings-error">{error}</span> : saved ? <span className="settings-success"><Check size={16} /> Ayarlar kaydedildi.</span> : <span>Değişiklikler kaydettikten sonra giriş ekranına uygulanır.</span>}</div><button className="settings-button settings-button-primary" disabled={saving}><Save size={16} /> {saving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}</button></div>
        </>}
      </form> : <form className="settings-content smtp-settings" onSubmit={event => { event.preventDefault(); void saveSmtp(false); }}>
        <div className="settings-content-heading"><div className="settings-content-icon"><Mail size={20} /></div><div><h2>E-posta/SMTP Ayarları</h2><p>Bu sunucu hızlı giriş doğrulama kodlarını ve test e-postalarını gönderir.</p></div></div>
        {!smtpDraft ? <div className="settings-loading">{smtpError || "SMTP ayarları yükleniyor..."}</div> : <>
          <section className="settings-card smtp-form-grid">
            <label>SMTP sunucusu<input required maxLength={255} value={smtpDraft.host} onChange={event => { setSmtpDraft({ ...smtpDraft, host: event.target.value }); setSmtpSaved(false); setSmtpTested(false); }} placeholder="smtp.example.com" /></label>
            <label>Port<input required type="number" min="1" max="65535" value={smtpDraft.port} onChange={event => { setSmtpDraft({ ...smtpDraft, port: Number(event.target.value) }); setSmtpSaved(false); setSmtpTested(false); }} /></label>
            <label>Kullanıcı / e-posta<input required maxLength={255} autoComplete="off" value={smtpDraft.user} onChange={event => { setSmtpDraft({ ...smtpDraft, user: event.target.value }); setSmtpSaved(false); setSmtpTested(false); }} /></label>
            <label>Gönderen adı ve adresi<input required maxLength={255} value={smtpDraft.from} onChange={event => { setSmtpDraft({ ...smtpDraft, from: event.target.value }); setSmtpSaved(false); setSmtpTested(false); }} placeholder={'Destek <mail@example.com>'} /></label>
            <label className="smtp-password-field">SMTP şifresi<input type="password" autoComplete="new-password" value={smtpPassword} onChange={event => { setSmtpPassword(event.target.value); setSmtpSaved(false); setSmtpTested(false); }} placeholder={smtpPasswordConfigured ? "Kayıtlı şifreyi korumak için boş bırakın" : "SMTP uygulama şifresi"} /><small>{smtpPasswordConfigured ? "Kaydedilmiş şifreyi güvenlik nedeniyle görüntülemiyoruz." : "Henüz SMTP şifresi ayarlanmamış."}</small></label>
            <label className="smtp-secure-option"><input type="checkbox" checked={smtpDraft.secure} onChange={event => { setSmtpDraft({ ...smtpDraft, secure: event.target.checked }); setSmtpSaved(false); setSmtpTested(false); }} /><span><strong>Doğrudan TLS kullan</strong><small>465 gibi TLS bağlantı portlarında açın; 587/STARTTLS için kapalı bırakın.</small></span></label>
          </section>
          <section className="settings-card smtp-security-note"><KeyRound size={18} /><div><strong>Şifre saklama güvenliği</strong><p>SMTP şifresi veritabanında AES-256-GCM ile şifreli saklanır. Şifreyi güncellemek için sunucuda <code>SMTP_SETTINGS_ENCRYPTION_KEY</code> tanımlı olmalıdır. {encryptionKeyConfigured ? "Şifreleme anahtarı yapılandırılmış." : "Şifreleme anahtarı henüz yapılandırılmamış."}</p></div></section>
          <div className="settings-save"><div role="status">{smtpError ? <span className={smtpTested ? "settings-success" : "settings-error"}>{smtpTested && <Check size={15} />}{smtpError}</span> : smtpSaved ? <span className="settings-success"><Check size={16} /> SMTP ayarları kaydedildi.</span> : <span>Test e-postası yönetici adresine gönderilir. Şifre boş bırakılırsa mevcut şifre korunur.</span>}</div><div className="smtp-actions"><button type="button" className="settings-button" disabled={smtpSaving || smtpTesting || !encryptionKeyConfigured && !smtpPasswordConfigured} onClick={() => void saveSmtp(true)}><Send size={15} />{smtpTesting ? "Test gönderiliyor..." : "Kaydet ve test et"}</button><button className="settings-button settings-button-primary" disabled={smtpSaving || smtpTesting}><Save size={16} />{smtpSaving ? "Kaydediliyor..." : "Ayarları kaydet"}</button></div></div>
        </>}
      </form>}
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
