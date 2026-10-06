import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, ImagePlus, LockKeyhole, Mail, RotateCcw, Save, Send, Sparkles } from "lucide-react";
import { request } from "../../shared/api";
import type { LoginSettings, SmtpSettings } from "../../shared/types";
import { Logo } from "../../shared/ui";
import "./settings.css";

type Tab = "login" | "smtp";
type SmtpDraft = Omit<SmtpSettings, "passwordConfigured" | "encryptionKeyConfigured">;

export default function Settings({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>("login");
  const [draft, setDraft] = useState<LoginSettings | null>(null);
  const [smtpDraft, setSmtpDraft] = useState<SmtpDraft | null>(null);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpTestAddress, setSmtpTestAddress] = useState("");
  const [smtpPasswordConfigured, setSmtpPasswordConfigured] = useState(false);
  const [encryptionKeyConfigured, setEncryptionKeyConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);
  const [backgroundOriginal, setBackgroundOriginal] = useState("/login-character.jpg");
  const [backgroundTolerance, setBackgroundTolerance] = useState(38);
  const [backgroundRemoved, setBackgroundRemoved] = useState(false);
  const [backgroundError, setBackgroundError] = useState("");
  const [error, setError] = useState("");
  const [smtpError, setSmtpError] = useState("");
  const [saved, setSaved] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpTested, setSmtpTested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    request<LoginSettings>("/admin/login-settings", token)
      .then(value => { if (!cancelled) { setDraft(value); setBackgroundOriginal(value.imageUrl); } })
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
    if (file.size > 15 * 1024 * 1024) { setError("Görsel dosyası en fazla 15 MB olabilir."); return; }
    try {
      setError(""); setBackgroundError(""); setSaved(false); setBackgroundRemoved(false);
      const imageUrl = await compressLoginImage(file);
      setDraft(current => current ? { ...current, imageUrl } : current);
      setBackgroundOriginal(imageUrl);
    } catch (reason) { setError((reason as Error).message); }
  }

  async function removeBackground() {
    if (!draft || removingBackground) return;
    setRemovingBackground(true); setBackgroundError("");
    try {
      const imageUrl = await removeFlatBackground(backgroundOriginal || draft.imageUrl, backgroundTolerance);
      setDraft(current => current ? { ...current, imageUrl } : current);
      setBackgroundRemoved(true); setSaved(false);
    } catch (reason) { setBackgroundError((reason as Error).message); }
    finally { setRemovingBackground(false); }
  }

  async function saveLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const result = await request<LoginSettings>("/admin/login-settings", token, { method: "PATCH", body: JSON.stringify(draft) });
      setDraft(result); setBackgroundOriginal(result.imageUrl); setSaved(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function saveSmtp(sendTest = false) {
    if (!smtpDraft || smtpSaving || smtpTesting) return;
    if (sendTest && !/^\S+@\S+\.\S+$/.test(smtpTestAddress.trim())) {
      setSmtpError("Test e-postası için geçerli bir alıcı adresi girin.");
      return;
    }
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
        const test = await request<{ sentTo: string }>("/admin/smtp-settings/test", token, {
          method: "POST", body: JSON.stringify({ to: smtpTestAddress.trim() }),
        });
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
    <div className="settings-heading"><h1>Ayarlar</h1></div>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Ayar bölümleri">
        <span className="settings-tabs-caption">BÖLÜMLER</span>
        <button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")} aria-current={tab === "login" ? "page" : undefined}><LockKeyhole size={18} /><span>Giriş ve Güvenlik</span></button>
        <button className={tab === "smtp" ? "active" : ""} onClick={() => setTab("smtp")} aria-current={tab === "smtp" ? "page" : undefined}><Mail size={18} /><span>E-posta/SMTP Ayarları</span></button>
      </nav>
      {tab === "login" ? <form className="settings-content" onSubmit={saveLogin}>
        {!draft ? <div className="settings-loading">{error || "Ayarlar yükleniyor..."}</div> : <>
          <section className="settings-card">
            <div className="settings-card-heading"><div><h3>Karşılama görseli</h3><p>Giriş ekranının sol bölümünde gösterilir.</p></div></div>
            <div className="settings-image-layout">
              <div className="settings-login-preview" aria-label="Giriş ekranı ön izlemesi">
                <div className="settings-login-preview-art"><div className="settings-preview-glow" /><img src={draft.imageUrl} alt="Karşılama görseli" /></div>
                <div className="settings-login-preview-form">
                  <small className="settings-preview-label">GİRİŞ EKRANI ÖN İZLEMESİ</small>
                  <div className="settings-login-preview-brand"><Logo /><small>Yönetim Merkezi</small></div>
                  <h4>Hoş geldiniz</h4><p>E-posta adresinizi yazın ve giriş yönteminizi seçin.</p>
                  <div className="settings-login-preview-input">E-posta</div>
                  {draft.quickLoginEnabled && <div className="settings-login-preview-primary">Hızlı Giriş</div>}
                  <div className="settings-login-preview-secondary">Giriş Yap</div>
                </div>
              </div>
              <aside className="settings-image-tools">
                <div className="settings-image-tools-heading"><h4>Görsel işlemleri</h4><span>PNG, JPEG veya WebP · en fazla 1,3 MB</span></div>
                <label className="settings-button settings-button-primary settings-image-upload" htmlFor="login-image"><ImagePlus size={16} /> Yeni görsel seç</label>
                <input id="login-image" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
                <button type="button" className="settings-button settings-reset-button settings-image-reset" onClick={() => { setDraft(current => current ? { ...current, imageUrl: "/login-character.jpg" } : current); setBackgroundOriginal("/login-character.jpg"); setBackgroundRemoved(false); setBackgroundTolerance(38); setBackgroundError(""); setError(""); setSaved(false); }}><RotateCcw size={16} /> Varsayılan görseli kullan</button>
                <div className="settings-background-tool"><div><strong>Arka planı kaldır</strong><p>Düz renkli fonlarda daha iyi sonuç verir.</p></div><button type="button" className="settings-remove-background" onClick={() => void removeBackground()} disabled={removingBackground}><Sparkles size={15} />{removingBackground ? "İşleniyor..." : backgroundRemoved ? "Tekrar uygula" : "Kaldır"}</button></div>
                {backgroundRemoved && <label className="settings-tolerance"><span>Hassasiyet <strong>{backgroundTolerance}</strong></span><input type="range" min="12" max="90" value={backgroundTolerance} onChange={event => setBackgroundTolerance(Number(event.target.value))} aria-label="Arka plan temizleme hassasiyeti" /><button type="button" onClick={() => void removeBackground()} disabled={removingBackground}>Uygula</button></label>}
                {backgroundError && <span className="settings-error" role="alert">{backgroundError}</span>}
                <p className="settings-image-hint"><Sparkles size={14} /> Temizleme ön izlemede görünür. Kaydettiğinizde giriş ekranına uygulanır.</p>
              </aside>
            </div>
          </section>
          <section className="settings-card"><div className="settings-card-heading"><div><h3>Giriş yöntemleri</h3><p>Yöneticinin kullanabileceği oturum açma seçenekleri.</p></div></div><div className="settings-method-row"><div><strong>E-posta koduyla hızlı giriş</strong><p>Tek kullanımlık doğrulama kodunu yönetici e-postasına gönderir.</p></div><button type="button" role="switch" aria-checked={draft.quickLoginEnabled} aria-label="E-posta koduyla hızlı girişi aç veya kapat" className={`settings-switch ${draft.quickLoginEnabled ? "on" : ""}`} onClick={() => { setDraft(current => current ? { ...current, quickLoginEnabled: !current.quickLoginEnabled } : current); setSaved(false); }}><span /></button></div><div className="settings-method-note"><Check size={16} /> Şifreyle giriş her zaman kullanılabilir.</div></section>
          <div className="settings-save"><div role="status">{error ? <span className="settings-error">{error}</span> : saved ? <span className="settings-success"><Check size={16} /> Ayarlar kaydedildi.</span> : <span>Değişiklikler kaydettikten sonra giriş ekranına uygulanır.</span>}</div><button className="settings-button settings-button-primary" disabled={saving}><Save size={16} /> {saving ? "Kaydediliyor..." : "Değişiklikleri kaydet"}</button></div>
        </>}
      </form> : <form className="settings-content smtp-settings" onSubmit={event => { event.preventDefault(); void saveSmtp(); }}>
        {!smtpDraft ? <div className="settings-loading">{smtpError || "SMTP ayarları yükleniyor..."}</div> : <>
          <section className="settings-card smtp-form-card">
            <div className="smtp-card-heading"><div><h2>Sunucu bağlantısı</h2></div><span className={`smtp-connection-state ${smtpPasswordConfigured ? "configured" : "needs-setup"}`}><i />{smtpPasswordConfigured ? "Şifre kayıtlı" : "Kurulum gerekli"}</span></div>
            <div className="smtp-form-grid">
              <label>SMTP sunucusu<input required maxLength={255} value={smtpDraft.host} onChange={event => { setSmtpDraft({ ...smtpDraft, host: event.target.value }); setSmtpSaved(false); setSmtpTested(false); }} placeholder="smtp.example.com" /><small>E-posta sağlayıcınızın SMTP adresi.</small></label>
              <label>Bağlantı portu<input required type="number" min="1" max="65535" value={smtpDraft.port} onChange={event => { setSmtpDraft({ ...smtpDraft, port: Number(event.target.value) }); setSmtpSaved(false); setSmtpTested(false); }} placeholder="587" /><small>Sağlayıcınızın verdiği port numarası.</small></label>
              <label>Kullanıcı adı / e-posta<input required maxLength={255} autoComplete="off" value={smtpDraft.user} onChange={event => { setSmtpDraft({ ...smtpDraft, user: event.target.value }); setSmtpSaved(false); setSmtpTested(false); }} placeholder="bildirim@example.com" /><small>SMTP hesabına girişte kullanılan adres.</small></label>
              <label>Gönderen adı ve adresi<input required maxLength={255} value={smtpDraft.from} onChange={event => { setSmtpDraft({ ...smtpDraft, from: event.target.value }); setSmtpSaved(false); setSmtpTested(false); }} placeholder={'Destek <mail@example.com>'} /><small>Alıcılara gösterilecek gönderen bilgisi.</small></label>
              <label className="smtp-password-field">SMTP şifresi<input type="password" autoComplete="new-password" value={smtpPassword} onChange={event => { setSmtpPassword(event.target.value); setSmtpSaved(false); setSmtpTested(false); }} placeholder={smtpPasswordConfigured ? "Kayıtlı şifreyi korumak için boş bırakın" : "SMTP uygulama şifresi"} /><small>{smtpPasswordConfigured ? "Kayıtlı şifre gösterilmez. Değiştirmek için yeni şifre girin." : "SMTP sağlayıcınızın şifresini veya uygulama parolasını girin."}</small></label>
              <fieldset className="smtp-security-choices"><legend>Şifreli bağlantı türü</legend><div>
                <label className={smtpDraft.secure ? "selected" : ""}><input type="radio" name="smtp-security" checked={smtpDraft.secure} onChange={() => { setSmtpDraft({ ...smtpDraft, secure: true }); setSmtpSaved(false); setSmtpTested(false); }} /><span><strong>SSL Kullanımı</strong><small>Şifreli bağlantı başlangıçtan itibaren etkin · genellikle 465</small></span></label>
                <label className={!smtpDraft.secure ? "selected" : ""}><input type="radio" name="smtp-security" checked={!smtpDraft.secure} onChange={() => { setSmtpDraft({ ...smtpDraft, secure: false }); setSmtpSaved(false); setSmtpTested(false); }} /><span><strong>TLS Kullanımı</strong><small>Bağlantı TLS ile şifrelenir · genellikle 587</small></span></label>
              </div></fieldset>
            </div>
          </section>
          <section className="settings-card smtp-test-card"><div className="smtp-test-copy"><h2>Test e-postası</h2><p>SMTP ayarlarını kaydedip bu adrese deneme iletisi gönderin.</p></div><div className="smtp-test-controls"><label><span>Alıcı e-posta adresi</span><input type="email" maxLength={255} value={smtpTestAddress} onChange={event => { setSmtpTestAddress(event.target.value); setSmtpError(""); setSmtpTested(false); }} placeholder="ornek@firma.com" /></label><button type="button" className="settings-button settings-button-primary" disabled={smtpSaving || smtpTesting || !encryptionKeyConfigured && !smtpPasswordConfigured} onClick={() => void saveSmtp(true)}><Send size={16} />{smtpTesting ? "Gönderiliyor..." : "Test gönder"}</button></div>{smtpError && <div className={smtpTested ? "smtp-test-result success" : "smtp-test-result error"} role="status">{smtpTested && <Check size={15} />}{smtpError}</div>}</section>
          <div className="settings-save smtp-save"><div role="status">{smtpSaved ? <span className="settings-success"><Check size={16} /> SMTP ayarları kaydedildi.</span> : <span>Test kartından adres girerek bağlantıyı deneyin. Boş bırakılan şifre korunur.</span>}</div><button className="settings-button settings-button-primary" disabled={smtpSaving || smtpTesting}><Save size={16} />{smtpSaving ? "Kaydediliyor..." : "Ayarları kaydet"}</button></div>
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
  return encodeCanvas(canvas, "image/jpeg");
}

async function removeFlatBackground(source: string, tolerance: number): Promise<string> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const response = await fetch(source);
  if (!response.ok) throw new Error("Görsel açılamadı.");
  const bitmap = await createImageBitmap(await response.blob());
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) { bitmap.close(); throw new Error("Görsel işlenemedi."); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const width = canvas.width, height = canvas.height, pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const edgeInset = Math.min(2, Math.floor(Math.min(width, height) / 4));
  const seeds = [edgeInset * width + edgeInset, edgeInset * width + width - 1 - edgeInset, (height - 1 - edgeInset) * width + edgeInset, (height - 1 - edgeInset) * width + width - 1 - edgeInset];
  const fade = 22;
  let removed = 0, seedMark = 1;
  for (const seed of seeds) {
    if (visited[seed]) { seedMark++; continue; }
    const offset = seed * 4;
    const [red, green, blue] = [data[offset], data[offset + 1], data[offset + 2]];
    let read = 0, write = 0;
    queue[write++] = seed; visited[seed] = seedMark;
    while (read < write) {
      const index = queue[read++], position = index * 4;
      if (data[position + 3] === 0) continue;
      const distance = Math.hypot(data[position] - red, data[position + 1] - green, data[position + 2] - blue);
      if (distance <= tolerance) { data[position + 3] = 0; removed++; }
      else data[position + 3] = Math.round(data[position + 3] * ((distance - tolerance) / fade));
      const x = index % width;
      const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, index >= width ? index - width : -1, index + width < pixelCount ? index + width : -1];
      for (const neighbor of neighbors) if (neighbor >= 0 && visited[neighbor] !== seedMark) {
        const neighborOffset = neighbor * 4;
        const colorDistance = Math.hypot(data[neighborOffset] - red, data[neighborOffset + 1] - green, data[neighborOffset + 2] - blue);
        if (colorDistance <= tolerance + fade && data[neighborOffset + 3] > 0) { visited[neighbor] = seedMark; queue[write++] = neighbor; }
      }
    }
    seedMark++;
  }
  if (removed < pixelCount * 0.002) throw new Error("Düz arka plan bulunamadı. Tek renkli bir arka plan görselinde deneyin.");
  context.putImageData(image, 0, 0);
  return encodeCanvas(canvas, "image/webp");
}

async function encodeCanvas(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/webp"): Promise<string> {
  for (const quality of [0.88, 0.78, 0.68, 0.56]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
    if (blob && blob.size <= 1_300_000) {
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Görsel okunamadı."));
        reader.onerror = () => reject(new Error("Görsel okunamadı."));
        reader.readAsDataURL(blob);
      });
      if (result.length <= 1_800_000) return result;
    }
  }
  throw new Error("Görsel 1,3 MB sınırını aşıyor; daha küçük bir dosya seçin.");
}
