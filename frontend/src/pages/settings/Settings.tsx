import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { request } from "../../shared/api";
import type { LoginSettings } from "../../shared/types";

export default function Settings({token}:{token:string}) {
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
