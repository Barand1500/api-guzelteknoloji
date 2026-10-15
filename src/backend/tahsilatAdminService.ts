/**
 * Tahsilat panel → MySQL (kategori tabloları).
 * Satırlar alan adıyla gelir/gider; AnyPay public /v1/tahsilat ile aynı kaynak.
 */
import { getSchema, InputError, saveRows } from "./categories.js";
import {
  ensureTahsilatResource,
  isTahsilatResource,
  type TahsilatResource,
} from "./tahsilatCatalog.js";

export type TahsilatAdminRow = {
  id: string;
  active: boolean;
  data: Record<string, string | number | boolean | null>;
};

function columnKey(name: string) {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function adminListTahsilat(resource: string) {
  if (!isTahsilatResource(resource)) {
    throw new InputError("Bilinmeyen Tahsilat kaynağı", 404);
  }
  const category = await ensureTahsilatResource(resource);
  const schema = await getSchema(category.id);
  const rows: TahsilatAdminRow[] = schema.rows.map((row) => {
    const data: Record<string, string | number | boolean | null> = {};
    for (const col of schema.columns) {
      const raw = row.data?.[String(col.id)];
      data[col.name] = raw === undefined || raw === null || raw === "" ? "" : raw;
    }
    return {
      id: String(row.id),
      active: row.active !== false,
      data,
    };
  });
  return {
    resource: resource as TahsilatResource,
    category: schema.category,
    columns: schema.columns.map((c) => ({
      id: c.id,
      name: c.name,
      fieldType: c.fieldType,
    })),
    rows,
  };
}

/** Panelden gelen satırları tamamen yazar (silinenler DB’den düşer). */
export async function adminReplaceTahsilat(
  resource: string,
  inputRows: Array<{
    id?: string | number | null;
    active?: boolean;
    data?: Record<string, unknown>;
  }>,
) {
  if (!isTahsilatResource(resource)) {
    throw new InputError("Bilinmeyen Tahsilat kaynağı", 404);
  }
  if (!Array.isArray(inputRows)) throw new InputError("Satır listesi gerekli");
  if (inputRows.length > 5000) throw new InputError("En fazla 5000 satır");

  const category = await ensureTahsilatResource(resource);
  const schema = await getSchema(category.id);
  const byName = new Map(schema.columns.map((c) => [columnKey(c.name), c]));

  const mapped = inputRows.map((row, index) => {
    if (!row || typeof row !== "object") throw new InputError(`${index + 1}. satır geçersiz`);
    const data: Record<string, unknown> = {};
    const incoming = row.data && typeof row.data === "object" ? row.data : {};
    for (const [key, value] of Object.entries(incoming)) {
      const col = byName.get(columnKey(key));
      if (!col) continue;
      data[String(col.id)] = value;
      data[col.name] = value;
    }
    const idRaw = row.id == null ? "" : String(row.id);
    const id = /^[1-9]\d*$/.test(idRaw) ? idRaw : undefined;
    return {
      id,
      active: row.active !== false,
      data,
    };
  });

  await saveRows(category.id, mapped);
  return adminListTahsilat(resource);
}
