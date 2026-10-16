import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FileUp,
  Filter,
  Printer,
  Search,
  X,
} from "lucide-react";
import { ExcelImportModal, type ExcelImportColumn } from "./ExcelImportModal";
import "./tahsilatDataTable.css";

export type TahsilatTableColumn<T> = {
  id: string;
  label: string;
  accessor: (row: T) => string;
  align?: "left" | "right" | "center";
  mono?: boolean;
  /** false ise sütun gizlenemez (örn. İşlemler) */
  hideable?: boolean;
  filterable?: boolean;
  render?: (row: T) => ReactNode;
};

export type TahsilatExcelImportConfig<T> = {
  columns: ExcelImportColumn[];
  mapRow: (cells: Record<string, string>, index: number) => T | null;
  validateRow?: (cells: Record<string, string>, index: number) => string | null;
  onConfirm: (rows: T[]) => Promise<void>;
  templateFileName?: string;
  title?: string;
};

type Props<T> = {
  rows: T[];
  columns: TahsilatTableColumn<T>[];
  getRowId: (row: T) => string;
  storageKey: string;
  searchPlaceholder?: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  exportFileName?: string;
  excelImport?: TahsilatExcelImportConfig<T>;
  /** Araç çubuğu soluna ekstra (opsiyonel) */
  toolbarStart?: ReactNode;
};

type FilterOp = "contains" | "equals" | "starts";

function loadVisibility(key: string, ids: string[]): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`tt-cols:${key}`);
    if (!raw) return Object.fromEntries(ids.map((id) => [id, true]));
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    const out: Record<string, boolean> = {};
    for (const id of ids) out[id] = parsed[id] !== false;
    return out;
  } catch {
    return Object.fromEntries(ids.map((id) => [id, true]));
  }
}

/** Ortak Tahsilat tablo widget’ı — sütun / filtre / CSV / yazdır / excel */
export function TahsilatDataTable<T>({
  rows,
  columns,
  getRowId,
  storageKey,
  searchPlaceholder = "Ara…",
  loading = false,
  emptyTitle = "Kayıt yok",
  emptyHint = "Yeni kayıt ekleyin veya Excel içe aktarın.",
  exportFileName = "tahsilat",
  excelImport,
  toolbarStart,
}: Props<T>) {
  const colIds = columns.map((c) => c.id);
  const [visibility, setVisibility] = useState(() => loadVisibility(storageKey, colIds));
  const [query, setQuery] = useState("");
  const [colQuery, setColQuery] = useState("");
  const [openPanel, setOpenPanel] = useState<"cols" | "filter" | "export" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filterCol, setFilterCol] = useState(columns.find((c) => c.filterable !== false)?.id || "");
  const [filterOp, setFilterOp] = useState<FilterOp>("contains");
  const [filterVal, setFilterVal] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(`tt-cols:${storageKey}`, JSON.stringify(visibility));
  }, [storageKey, visibility]);

  useEffect(() => {
    setPage(0);
  }, [query, filterVal, filterCol, filterOp, pageSize, rows.length]);

  useEffect(() => {
    if (!openPanel) return;
    const onDoc = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) setOpenPanel(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openPanel]);

  const visibleCols = useMemo(
    () => columns.filter((c) => c.hideable === false || visibility[c.id] !== false),
    [columns, visibility],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const fv = filterVal.trim().toLocaleLowerCase("tr-TR");
    const fCol = columns.find((c) => c.id === filterCol);
    return rows.filter((row) => {
      if (q) {
        const blob = columns
          .map((c) => c.accessor(row))
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        if (!blob.includes(q)) return false;
      }
      if (fv && fCol) {
        const cell = fCol.accessor(row).toLocaleLowerCase("tr-TR");
        if (filterOp === "equals" && cell !== fv) return false;
        if (filterOp === "starts" && !cell.startsWith(fv)) return false;
        if (filterOp === "contains" && !cell.includes(fv)) return false;
      }
      return true;
    });
  }, [rows, query, filterVal, filterCol, filterOp, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const colPanelList = columns.filter((c) => {
    if (c.hideable === false) return false;
    const q = colQuery.trim().toLocaleLowerCase("tr-TR");
    if (!q) return true;
    return c.label.toLocaleLowerCase("tr-TR").includes(q);
  });

  const allVisible = columns
    .filter((c) => c.hideable !== false)
    .every((c) => visibility[c.id] !== false);

  function toggleAll(next: boolean) {
    setVisibility((prev) => {
      const out = { ...prev };
      for (const c of columns) {
        if (c.hideable === false) out[c.id] = true;
        else out[c.id] = next;
      }
      return out;
    });
  }

  function resetCols() {
    setVisibility(Object.fromEntries(colIds.map((id) => [id, true])));
    setColQuery("");
  }

  function exportCsv() {
    const headers = visibleCols.map((c) => c.label);
    const lines = [
      headers.join(";"),
      ...filtered.map((row) =>
        visibleCols
          .map((c) => {
            const v = c.accessor(row).replace(/"/g, '""');
            return `"${v}"`;
          })
          .join(";"),
      ),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setOpenPanel(null);
  }

  function printTable() {
    const headers = visibleCols.map((c) => `<th>${c.label}</th>`).join("");
    const body = filtered
      .map(
        (row) =>
          `<tr>${visibleCols.map((c) => `<td>${c.accessor(row)}</td>`).join("")}</tr>`,
      )
      .join("");
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${exportFileName}</title>
<style>body{font-family:system-ui,sans-serif;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}th{background:#f3f4f6}</style>
</head><body><h1>${exportFileName}</h1><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
    setOpenPanel(null);
  }

  const from = filtered.length ? safePage * pageSize + 1 : 0;
  const to = Math.min(filtered.length, (safePage + 1) * pageSize);

  return (
    <>
      <section className="tt-panel">
        <div className="tt-toolbar" ref={toolbarRef}>
          {toolbarStart}
          <div className="tt-toolbar-icons">
            <div className="tt-pop-anchor">
              <button
                type="button"
                className={`tt-icon-btn${openPanel === "cols" ? " open" : ""}`}
                title="Sütunlar"
                aria-label="Sütunlar"
                onClick={() => setOpenPanel((p) => (p === "cols" ? null : "cols"))}
              >
                <Columns3 size={18} />
              </button>
              {openPanel === "cols" ? (
                <div className="tt-pop" role="dialog" aria-label="Sütun görünürlüğü">
                  <label className="tt-pop-search">
                    <Search size={15} />
                    <input
                      value={colQuery}
                      onChange={(e) => setColQuery(e.target.value)}
                      placeholder="Arama"
                      autoFocus
                    />
                  </label>
                  <div className="tt-pop-list">
                    {colPanelList.map((c) => (
                      <label key={c.id} className="tt-check">
                        <input
                          type="checkbox"
                          checked={visibility[c.id] !== false}
                          onChange={(e) =>
                            setVisibility((prev) => ({ ...prev, [c.id]: e.target.checked }))
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  <div className="tt-pop-foot">
                    <label className="tt-check" style={{ padding: 0 }}>
                      <input
                        type="checkbox"
                        checked={allVisible}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                      Hepsini Göster/Gizle
                    </label>
                    <button type="button" className="tt-link" onClick={resetCols}>
                      Sıfırla
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="tt-pop-anchor">
              <button
                type="button"
                className={`tt-icon-btn${openPanel === "filter" ? " open" : ""}`}
                title="Filtre"
                aria-label="Filtre"
                onClick={() => setOpenPanel((p) => (p === "filter" ? null : "filter"))}
              >
                <Filter size={18} />
              </button>
              {openPanel === "filter" ? (
                <div className="tt-pop" style={{ minWidth: 420 }} role="dialog" aria-label="Filtre">
                  <div className="tt-filter-row">
                    <button
                      type="button"
                      className="tt-filter-close"
                      aria-label="Filtreyi kapat"
                      onClick={() => {
                        setFilterVal("");
                        setOpenPanel(null);
                      }}
                    >
                      <X size={16} />
                    </button>
                    <div className="tt-filter-field">
                      <label>Sütunlar</label>
                      <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)}>
                        {columns
                          .filter((c) => c.filterable !== false && c.hideable !== false)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="tt-filter-field">
                      <label>Operatör</label>
                      <select
                        value={filterOp}
                        onChange={(e) => setFilterOp(e.target.value as FilterOp)}
                      >
                        <option value="contains">içerir</option>
                        <option value="equals">eşittir</option>
                        <option value="starts">ile başlar</option>
                      </select>
                    </div>
                    <div className="tt-filter-field">
                      <label>Değer</label>
                      <input
                        value={filterVal}
                        onChange={(e) => setFilterVal(e.target.value)}
                        placeholder="Filtre değeri"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <span className="tt-sep" aria-hidden />

            <div className="tt-pop-anchor">
              <button
                type="button"
                className={`tt-icon-btn${openPanel === "export" ? " open" : ""}`}
                title="Dışa aktar"
                aria-label="Dışa aktar"
                onClick={() => setOpenPanel((p) => (p === "export" ? null : "export"))}
              >
                <Download size={18} />
              </button>
              {openPanel === "export" ? (
                <div className="tt-pop tt-menu" role="menu">
                  <button type="button" role="menuitem" onClick={printTable}>
                    <Printer size={14} style={{ marginRight: 8, verticalAlign: -2 }} />
                    Yazdır
                  </button>
                  <button type="button" role="menuitem" onClick={exportCsv}>
                    CSV olarak aktar
                  </button>
                </div>
              ) : null}
            </div>

            {excelImport ? (
              <button
                type="button"
                className="tt-icon-btn"
                title="Excel içe aktar"
                aria-label="Excel içe aktar"
                onClick={() => {
                  setOpenPanel(null);
                  setImportOpen(true);
                }}
              >
                <FileUp size={18} />
              </button>
            ) : null}

            <span className="tt-sep" aria-hidden />
          </div>

          <label className="tt-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Ara"
            />
          </label>
        </div>

        <div className="tt-table-wrap">
          {slice.length ? (
            <table className="tt-table">
              <thead>
                <tr>
                  {visibleCols.map((c) => (
                    <th key={c.id} style={{ textAlign: c.align || "left" }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <tr key={getRowId(row)}>
                    {visibleCols.map((c) => (
                      <td
                        key={c.id}
                        className={c.mono ? "tt-mono" : undefined}
                        style={{ textAlign: c.align || "left" }}
                      >
                        {c.render ? c.render(row) : c.accessor(row) || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="tt-empty">
              <strong>{loading ? "Yükleniyor…" : query || filterVal ? "Eşleşen kayıt yok" : emptyTitle}</strong>
              <span>
                {loading
                  ? "Veritabanından okunuyor."
                  : query || filterVal
                    ? "Arama veya filtreyi değiştirin."
                    : emptyHint}
              </span>
            </div>
          )}
        </div>

        <div className="tt-footer">
          <label>
            Sayfa başına satır:
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) || 10)}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="tt-page-btns">
            <span>
              {from}–{to} / {filtered.length}
            </span>
            <button
              type="button"
              aria-label="Önceki sayfa"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Sonraki sayfa"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {excelImport ? (
        <ExcelImportModal
          open={importOpen}
          title={excelImport.title}
          columns={excelImport.columns}
          mapRow={excelImport.mapRow}
          validateRow={excelImport.validateRow}
          templateFileName={excelImport.templateFileName}
          onClose={() => setImportOpen(false)}
          onConfirm={excelImport.onConfirm}
        />
      ) : null}
    </>
  );
}
