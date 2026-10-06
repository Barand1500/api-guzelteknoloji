import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileSpreadsheet, FileUp, X } from "lucide-react";
import { request } from "../../shared/api";
import type { Column, DataRow, Schema } from "../../shared/types";
import "./import-wizard.css";

type Props = { token: string; categoryId: number; columns: Column[]; relationOptions: Schema["relationOptions"]; onClose: () => void; onImported: (rows: DataRow[]) => void };
type PreviewRow = { sourceRow: number; values: Record<string, string>; displayValues: Record<string, string>; error: string };
const LIMIT_ROWS = 5000;
const LIMIT_COLUMNS = 80;
const LIMIT_FILE_BYTES = 10 * 1024 * 1024;
const LIMIT_REQUEST_BYTES = 8 * 1024 * 1024;
const cp1252Decoder = new TextDecoder("windows-1252");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const cp1252ByteByCharacter = new Map<string, number>();
for (let byte = 0; byte < 256; byte++) cp1252ByteByCharacter.set(cp1252Decoder.decode(Uint8Array.of(byte)), byte);

function mojibakeScore(value: string) {
  let score = 0;
  for (let index = 0; index < value.length - 1; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x00c3 || code === 0x00c4 || code === 0x00c5) score++;
  }
  return score;
}

function repairMojibakeSegment(value: string) {
  let current = value;
  for (let pass = 0; pass < 2; pass++) {
    const score = mojibakeScore(current);
    if (!score) break;
    const bytes: number[] = [];
    let convertible = true;
    for (const character of current) {
      const byte = cp1252ByteByCharacter.get(character);
      if (byte === undefined) { convertible = false; break; }
      bytes.push(byte);
    }
    if (!convertible) break;
    try {
      const decoded = utf8Decoder.decode(Uint8Array.from(bytes));
      if (mojibakeScore(decoded) >= score) break;
      current = decoded;
    } catch { break; }
  }
  return current;
}

function repairMojibake(value: string) {
  let result = "";
  let segment = "";
  for (const character of value) {
    if (cp1252ByteByCharacter.has(character)) segment += character;
    else {
      result += repairMojibakeSegment(segment) + character;
      segment = "";
    }
  }
  return result + repairMojibakeSegment(segment);
}

function normalizedLookup(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\u0131/g, "i").replace(/[^a-z0-9]/g, "");
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  return String(value).trim();
}

function normalizedHeader(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "");
}

function validateValue(value: string, column: Column, relationOptions: Schema["relationOptions"]) {
  if (!value) return "";
  if (column.fieldType === "integer" && !/^-?(?:0|[1-9]\d{0,9})$/.test(value)) return "tam sayı olmalı";
  if (column.fieldType === "integer" && (Number(value) < -2147483648 || Number(value) > 2147483647)) return "32 bit tam sayı sınırını aşıyor";
  if (column.fieldType === "number" && !/^-?(?:0|[1-9]\d{0,13})(?:[.,]\d{1,6})?$/.test(value)) return "sayı biçimi geçersiz";
  if (column.fieldType === "float" && (!Number.isFinite(Number(value.replace(",", "."))) || !/^-?(?:0|[1-9]\d{0,14})(?:[.,]\d+)?(?:[eE][+-]?\d{1,3})?$/.test(value))) return "ondalık sayı biçimi geçersiz";
  if ((column.fieldType === "boolean" || column.fieldType === "boolean_text") && !["true", "false", "1", "0"].includes(value.toLocaleLowerCase("tr-TR"))) return "true/false veya 1/0 olmalı";
  if (column.fieldType === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return "tarih YYYY-AA-GG biçiminde olmalı";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return "geçerli bir tarih değil";
  }
  if (column.fieldType === "relation" && !relationOptions[column.referenceCategoryId || 0]?.some(option => option.id === value)) return "ilişkili kayıt bulunamadı";
  if (column.fieldType.startsWith("image")) {
    const uploaded = /^\/uploads\/images\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/i.test(value);
    const embedded = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
    if (!(column.fieldType === "image_upload" ? uploaded : column.fieldType === "image_base64" ? embedded : uploaded || embedded)) return "geçerli yükleme yolu veya Base64 görseli olmalı";
    if (value.length > 1_450_000) return "görsel verisi 1 MB sınırını aşıyor";
  }
  return "";
}

export default function ImportWizard({ token, categoryId, columns, relationOptions, onClose, onImported }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [rowFilter, setRowFilter] = useState<"all" | "valid" | "invalid">("all");
  const [showMappings, setShowMappings] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo<PreviewRow[]>(() => sourceRows.map((source, index) => {
    const values: Record<string, string> = {};
    const displayValues: Record<string, string> = {};
    const issues: string[] = [];
    mapping.forEach((fieldId, sourceIndex) => {
      if (!fieldId) return;
      const column = columns.find(item => String(item.id) === fieldId);
      if (!column) return;
      const sourceValue = repairMojibake(textValue(source[sourceIndex]));
      let value = sourceValue;
      if ((column.fieldType === "boolean" || column.fieldType === "boolean_text") && value) value = value.toLocaleLowerCase("tr-TR");
      let relationProblem = "";
      if (column.fieldType === "relation" && value) {
        const choices = relationOptions[column.referenceCategoryId || 0] || [];
        if (!choices.some(option => option.id === value)) {
          const normalized = normalizedLookup(value);
          const matches = choices.filter(option => normalizedLookup(option.label) === normalized);
          if (matches.length === 1) value = matches[0].id;
          else relationProblem = matches.length > 1
            ? "aynı adla birden fazla ilişkili kayıt var; ID kullanın"
            : "ilişkili kayıt bulunamadı (ID veya kayıt adı girin)";
        }
      }
      values[fieldId] = value;
      displayValues[fieldId] = sourceValue;
      const problem = relationProblem || validateValue(value, column, relationOptions);
      if (problem) issues.push(`${column.name}: ${problem}`);
    });
    return { sourceRow: index + 2, values, displayValues, error: issues.join(" · ") };
  }), [sourceRows, mapping, columns, relationOptions]);
  const nonempty = preview.filter(row => Object.values(row.values).some(value => value !== ""));
  const validRows = nonempty.filter(row => !row.error);
  const invalidRows = nonempty.filter(row => Boolean(row.error));
  const mappedCount = mapping.filter(Boolean).length;
  const requestTooLarge = new Blob([JSON.stringify(validRows.map(row => row.values))]).size > LIMIT_REQUEST_BYTES;
  const filteredRows = rowFilter === "valid" ? validRows : rowFilter === "invalid" ? invalidRows : nonempty;
  const previewPageSize = 25;
  const previewPageCount = Math.max(1, Math.ceil(filteredRows.length / previewPageSize));
  const displayedRows = filteredRows.slice((previewPage - 1) * previewPageSize, previewPage * previewPageSize);
  const mappedColumns = mapping.flatMap((id, index) => {
    const column = columns.find(item => String(item.id) === id);
    return column ? [{ source: headers[index], target: column.name, type: column.fieldType }] : [];
  });

  function selectRowFilter(filter: "all" | "valid" | "invalid") {
    setRowFilter(filter);
    setPreviewPage(1);
    setShowMappings(false);
  }

  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    setDone(0);
    if (file.size > LIMIT_FILE_BYTES) { setError("Dosya en fazla 10 MB olabilir."); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError(".xlsx, .xls veya .csv dosyası seçin."); return; }
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, codepage: 1254 });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("Dosyada okunabilir bir sayfa bulunamadı.");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: true, blankrows: false });
      if (matrix.length < 2) throw new Error("Dosyada başlık ve en az bir veri satırı olmalı.");
      const fileHeaders = (matrix[0] || []).map((value, index) => repairMojibake(textValue(value)) || `Sütun ${index + 1}`);
      if (fileHeaders.length > LIMIT_COLUMNS) throw new Error(`Dosyada en fazla ${LIMIT_COLUMNS} sütun olabilir.`);
      const data = matrix.slice(1).filter(row => row.some(value => textValue(value) !== ""));
      if (data.length > LIMIT_ROWS) throw new Error(`Tek seferde en fazla ${LIMIT_ROWS.toLocaleString("tr-TR")} satır yükleyebilirsiniz.`);
      if (!data.length) throw new Error("Dosyada aktarılacak kayıt bulunamadı.");
      const used = new Set<string>();
      const matches = fileHeaders.map(header => {
        const normalized = normalizedHeader(header);
        const found = columns.find(column => !used.has(String(column.id)) && (normalizedHeader(column.name) === normalized || normalizedHeader(column.sqlName || "") === normalized));
        if (found) used.add(String(found.id));
        return found ? String(found.id) : "";
      });
      setHeaders(fileHeaders);
      setSourceRows(data);
      setMapping(matches);
      setFileName(file.name);
      setStep(2);
    } catch (reason) {
      setError((reason as Error).message || "Dosya okunamadı.");
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) { void readFile(event.target.files?.[0]); event.target.value = ""; }
  function updateMapping(index: number, value: string) { setMapping(current => current.map((item, position) => position === index ? value : item)); }
  async function importValidRows() {
    if (!validRows.length || requestTooLarge || busy) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ rows: DataRow[] }>(`/admin/categories/${categoryId}/import`, token, {
        method: "POST", body: JSON.stringify({ rows: validRows.map(row => row.values) }),
      });
      onImported(result.rows);
      setDone(result.rows.length);
      setStep(3);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  const stepTitles = ["Dosya seç", "Sütunları eşleştir", "Ön izleme"];
  return <div className="import-wizard-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="import-wizard" role="dialog" aria-modal="true" aria-labelledby="import-wizard-title">
      <header className="import-wizard-header"><div><span className="import-wizard-eyebrow">TOPLU VERİ YÜKLEME</span><h2 id="import-wizard-title">Excel'den içe aktar</h2><p>Dosyanı seç, sütunları eşleştir ve kayıtları kontrol ederek ekle.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Pencereyi kapat"><X size={20} /></button></header>
      <nav className="import-wizard-steps" aria-label="Yükleme adımları">{stepTitles.map((title, index) => { const number = index + 1; return <div className={`import-wizard-step ${step === number ? "current" : step > number ? "complete" : ""}`} key={title}><span>{step > number ? <Check size={15} /> : number}</span>{title}</div>; })}</nav>

      {step === 1 && <div className="import-wizard-body"><button className="import-file-drop" type="button" onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void readFile(event.dataTransfer.files[0]); }}><span><FileUp size={26} /></span><strong>Excel veya CSV dosyanı seç</strong><small>Dosyayı buraya bırak ya da bilgisayarından göz at</small><em>.xlsx, .xls veya .csv · en fazla 10 MB ve 5.000 satır</em></button><input ref={inputRef} className="import-file-input" type="file" accept=".xlsx,.xls,.csv" onChange={selectFile} />{error && <p className="import-wizard-error" role="alert">{error}</p>}<div className="import-wizard-note"><FileSpreadsheet size={18} /><span>İlk satır sütun başlıklarını içermeli. Mevcut kayıtlar korunur; dosyadaki satırlar yeni kayıt olarak eklenir.</span></div></div>}

      {step === 2 && <div className="import-wizard-body"><div className="import-file-summary"><FileSpreadsheet size={19} /><div><strong>{fileName}</strong><span>{sourceRows.length.toLocaleString("tr-TR")} satır · {headers.length} sütun bulundu</span></div><button type="button" onClick={() => setStep(1)}>Dosyayı değiştir</button></div><div className="import-map-intro"><strong>Dosya başlıklarını tablo sütunlarına bağla</strong><span>Benzer adları otomatik eşleştirdik. İstersen seçimleri değiştirebilirsin.</span></div><div className="import-map-list">{headers.map((header, index) => { const selected = mapping[index]; const usedByOther = (id: string) => mapping.some((value, other) => other !== index && value === id); return <label className="import-map-row" key={`${header}-${index}`}><span className="import-map-source"><small>EXCEL SÜTUNU</small><strong>{header}</strong><em>{repairMojibake(textValue(sourceRows[0]?.[index])) || "Örnek değer yok"}</em></span><ArrowRight size={18} /><select value={selected} onChange={event => updateMapping(index, event.target.value)} aria-label={`${header} için hedef sütun`}><option value="">Bu sütunu atla</option>{columns.map(column => <option key={column.id} value={column.id} disabled={usedByOther(String(column.id))}>{column.name} · {column.fieldType}</option>)}</select></label>; })}</div>{error && <p className="import-wizard-error" role="alert">{error}</p>}</div>}

      {step === 3 && <div className="import-wizard-body">{done > 0 ? <div className="import-complete"><CheckCircle2 size={25} /><div><strong>{done.toLocaleString("tr-TR")} kayıt eklendi</strong><span>Yeni kayıtlar tabloya işlendi. Yüklemeyi kapatıp devam edebilirsin.</span></div></div> : <>
        <div className="import-preview-summary">
          <button type="button" className={`import-preview-filter ${rowFilter === "valid" ? "selected" : ""}`} aria-pressed={rowFilter === "valid"} onClick={() => selectRowFilter(rowFilter === "valid" ? "all" : "valid")}><strong>{validRows.length.toLocaleString("tr-TR")}</strong> içe aktarılabilir</button>
          <button type="button" className={`import-preview-filter has-errors ${rowFilter === "invalid" ? "selected" : ""}`} aria-pressed={rowFilter === "invalid"} onClick={() => selectRowFilter(rowFilter === "invalid" ? "all" : "invalid")}><strong>{invalidRows.length.toLocaleString("tr-TR")}</strong> hatalı satır</button>
          <button type="button" className={`import-preview-filter ${showMappings ? "selected" : ""}`} aria-expanded={showMappings} onClick={() => { setShowMappings(value => !value); setRowFilter("all"); setPreviewPage(1); }}><strong>{mappedCount}</strong> sütun eşleşti</button>
        </div>
        {showMappings && <div className="import-mapped-columns">{mappedColumns.map((item, index) => <div key={`${item.source}-${index}`}><span>{item.source}</span><ArrowRight size={15} /><strong>{item.target}</strong><small>{item.type}</small></div>)}</div>}
        {filteredRows.length === 0 ? <div className="import-preview-empty">Bu filtrede gösterilecek satır yok.</div> : <>
          <div className="import-preview-table-wrap"><table className="import-preview-table"><thead><tr><th>Excel satırı</th>{mapping.map((id, index) => id ? <th key={`${headers[index]}-${index}`}>{columns.find(column => String(column.id) === id)?.name}</th> : null)}<th>Kontrol</th></tr></thead><tbody>{displayedRows.map(row => <tr key={row.sourceRow} className={row.error ? "invalid" : "valid"}><td>{row.sourceRow}</td>{mapping.map((id, index) => id ? <td key={`${id}-${index}`}>{row.displayValues[id] || <span className="import-empty-value">—</span>}</td> : null)}<td>{row.error ? <span className="import-row-error" title={row.error}>Hata · {row.error}</span> : <span className="import-row-valid"><Check size={14} /> Hazır</span>}</td></tr>)}</tbody></table></div>
          <div className="import-preview-pagination"><span>{((previewPage - 1) * previewPageSize + 1).toLocaleString("tr-TR")}–{Math.min(previewPage * previewPageSize, filteredRows.length).toLocaleString("tr-TR")} / {filteredRows.length.toLocaleString("tr-TR")} satır</span><div><button type="button" disabled={previewPage <= 1} onClick={() => setPreviewPage(page => Math.max(1, page - 1))}>Önceki</button><span>{previewPage} / {previewPageCount}</span><button type="button" disabled={previewPage >= previewPageCount} onClick={() => setPreviewPage(page => Math.min(previewPageCount, page + 1))}>Sonraki</button></div></div>
        </>}
        {invalidRows.length > 0 && <p className="import-wizard-note warning">Hatalı satırlar eklenmez. Hatalı satır sayacına tıklayıp hangileri olduğunu inceleyebilirsin.</p>}{requestTooLarge && <p className="import-wizard-error" role="alert">Aktarım 8 MB sınırını aşıyor. Daha küçük bir dosyayla yeniden deneyin.</p>}{error && <p className="import-wizard-error" role="alert">{error}</p>}
      </>}</div>}

      <footer className="import-wizard-footer">{step === 1 ? <button className="import-cancel" type="button" onClick={onClose}>Vazgeç</button> : step === 3 && done > 0 ? <button className="import-primary" type="button" onClick={onClose}>Tamam</button> : <><button className="import-cancel" type="button" onClick={() => { setError(""); setStep(step === 3 ? 2 : 1); }}>{step === 3 ? <><ArrowLeft size={16} /> Eşleştirmeye dön</> : <><ArrowLeft size={16} /> Dosyayı değiştir</>}</button>{step === 2 ? <button className="import-primary" type="button" disabled={!mappedCount || !sourceRows.length} onClick={() => { setError(""); setStep(3); }}>Ön izlemeyi gör <ArrowRight size={16} /></button> : <button className="import-primary" type="button" disabled={!validRows.length || requestTooLarge || busy} onClick={() => void importValidRows()}>{busy ? "Kayıtlar ekleniyor…" : `${validRows.length.toLocaleString("tr-TR")} kaydı içe aktar`} <ArrowRight size={16} /></button>}</>}</footer>
    </section>
  </div>;
}
