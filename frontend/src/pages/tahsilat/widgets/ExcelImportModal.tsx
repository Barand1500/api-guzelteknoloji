import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";

export type ExcelImportColumn = {
  key: string;
  label: string;
  /** Excel başlık eşleşmeleri (küçük harf) */
  aliases?: string[];
  required?: boolean;
};

type PreviewRow = {
  cells: Record<string, string>;
  ok: boolean;
  reason?: string;
};

type Props<T> = {
  open: boolean;
  title?: string;
  columns: ExcelImportColumn[];
  /** Ham hücreler → kayıt; null = satır atlanır / hatalı */
  mapRow: (cells: Record<string, string>, index: number) => T | null;
  validateRow?: (cells: Record<string, string>, index: number) => string | null;
  onConfirm: (rows: T[]) => Promise<void>;
  onClose: () => void;
  templateFileName?: string;
};

function normHeader(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");
}

function pickCell(row: Record<string, unknown>, col: ExcelImportColumn): string {
  const aliases = [col.label, col.key, ...(col.aliases || [])].map(normHeader);
  for (const [rawKey, rawVal] of Object.entries(row)) {
    if (aliases.includes(normHeader(rawKey))) {
      return String(rawVal ?? "").trim();
    }
  }
  return "";
}

/** Excel / CSV yükleme — önce önizleme, onaylanınca yazılır */
export function ExcelImportModal<T>({
  open,
  title = "Excel’den içe aktar",
  columns,
  mapRow,
  validateRow,
  onConfirm,
  onClose,
  templateFileName = "sablon.xlsx",
}: Props<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [mapped, setMapped] = useState<T[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFileName("");
    setPreview([]);
    setMapped([]);
    setError("");
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const stats = useMemo(() => {
    const ok = preview.filter((p) => p.ok).length;
    return { total: preview.length, ok, bad: preview.length - ok };
  }, [preview]);

  const parseFile = useCallback(
    async (file: File) => {
      setError("");
      setFileName(file.name);
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) {
          setError("Dosyada sayfa bulunamadı.");
          setPreview([]);
          setMapped([]);
          return;
        }
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
          raw: false,
        });
        if (!json.length) {
          setError("Dosya boş görünüyor.");
          setPreview([]);
          setMapped([]);
          return;
        }

        const nextPreview: PreviewRow[] = [];
        const nextMapped: T[] = [];
        json.forEach((raw, index) => {
          const cells: Record<string, string> = {};
          for (const col of columns) {
            cells[col.key] = pickCell(raw, col);
          }
          const missing = columns
            .filter((c) => c.required !== false && !cells[c.key])
            .map((c) => c.label);
          let reason: string | null = missing.length
            ? `Eksik: ${missing.join(", ")}`
            : null;
          if (!reason && validateRow) reason = validateRow(cells, index);
          if (reason) {
            nextPreview.push({ cells, ok: false, reason });
            return;
          }
          const mappedRow = mapRow(cells, index);
          if (!mappedRow) {
            nextPreview.push({ cells, ok: false, reason: "Satır dönüştürülemedi" });
            return;
          }
          nextPreview.push({ cells, ok: true });
          nextMapped.push(mappedRow);
        });
        setPreview(nextPreview);
        setMapped(nextMapped);
        if (!nextMapped.length) {
          setError("Onaylanabilir geçerli satır yok. Başlıkları kontrol edin.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Dosya okunamadı");
        setPreview([]);
        setMapped([]);
      }
    },
    [columns, mapRow, validateRow],
  );

  function downloadTemplate() {
    const headers = columns.map((c) => c.label);
    const sample = columns.map((c) => (c.key === "bin" ? "526955" : ""));
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Veri");
    XLSX.writeFile(wb, templateFileName);
  }

  async function confirm() {
    if (!mapped.length || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(mapped);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="tt-import-overlay" role="presentation">
      <div
        ref={modalRef}
        className="tt-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tt-import-title"
      >
        <div className="tt-import-head">
          <div>
            <h2 id="tt-import-title">{title}</h2>
            <p>Dosyayı yükleyin, önizleyin; onaylamadan veritabanına yazılmaz.</p>
          </div>
          <button
            type="button"
            className="tt-filter-close"
            onClick={() => !busy && onClose()}
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="tt-import-body">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void parseFile(f);
              e.target.value = "";
            }}
          />

          <div
            className={`tt-drop${drag ? " drag" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void parseFile(f);
            }}
          >
            <Upload size={28} strokeWidth={1.75} />
            <strong>Excel / CSV sürükleyin veya seçin</strong>
            <span>.xlsx · .xls · .csv — önce önizleme, sonra onay</span>
          </div>

          <div className="tt-import-meta">
            <span>
              {fileName ? (
                <>
                  Dosya: <strong>{fileName}</strong>
                </>
              ) : (
                "Henüz dosya seçilmedi"
              )}
            </span>
            <button type="button" className="tt-link" onClick={downloadTemplate}>
              Şablon indir
            </button>
          </div>

          {error ? (
            <p className="tt-import-err" role="alert">
              {error}
            </p>
          ) : null}

          {preview.length ? (
            <>
              <div className="tt-import-meta">
                <span>
                  Önizleme: <strong>{stats.ok}</strong> geçerli
                  {stats.bad ? (
                    <>
                      {" "}
                      · <span className="tt-badge-warn">{stats.bad} hatalı</span>
                    </>
                  ) : null}
                </span>
                <span>Onayda yalnızca geçerli satırlar yazılır</span>
              </div>
              <div className="tt-import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {columns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 80).map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        {columns.map((c) => (
                          <td key={c.key}>{row.cells[c.key] || "—"}</td>
                        ))}
                        <td>
                          {row.ok ? (
                            <span style={{ color: "#15803d", fontWeight: 700 }}>OK</span>
                          ) : (
                            <span className="tt-badge-warn">{row.reason || "Hata"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 80 ? (
                <span style={{ color: "#94a3b8", fontSize: 12 }}>
                  İlk 80 satır gösteriliyor (toplam {preview.length}).
                </span>
              ) : null}
            </>
          ) : (
            <div className="tt-empty" style={{ padding: 20 }}>
              <FileSpreadsheet size={28} strokeWidth={1.5} style={{ margin: "0 auto 8px" }} />
              <strong>Önizleme burada görünecek</strong>
              <span>Başlık satırı: {columns.map((c) => c.label).join(" · ")}</span>
            </div>
          )}
        </div>

        <div className="tt-import-foot">
          <button type="button" className="tt-btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="tt-btn primary"
            disabled={!mapped.length || busy}
            onClick={() => void confirm()}
          >
            {busy ? "Kaydediliyor…" : `${mapped.length} satırı onayla ve kaydet`}
          </button>
        </div>
      </div>
    </div>
  );
}
