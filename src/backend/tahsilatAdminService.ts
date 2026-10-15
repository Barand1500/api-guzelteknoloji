/**
 * Tahsilat panel → MySQL.
 * Satır ekle / güncelle / sil — tam liste replace riskli olduğu için tekil CRUD.
 */
import { getSchema, InputError } from "./categories.js";
import { identifier, pool } from "./database.js";
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

function toSqlValue(value: unknown, fieldType: string): string | number | null {
  if (value === "" || value === undefined || value === null) return null;
  if (fieldType === "integer") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return String(value);
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

function mapIncomingData(
  schema: Awaited<ReturnType<typeof getSchema>>,
  incoming: Record<string, unknown>,
) {
  const byName = new Map(schema.columns.map((c) => [columnKey(c.name), c]));
  const mapped: Array<{ sqlName: string; fieldType: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(incoming)) {
    const col = byName.get(columnKey(key));
    if (!col) continue;
    const sqlName = col.sqlName || col.name;
    mapped.push({ sqlName, fieldType: col.fieldType, value });
  }
  return mapped;
}

/** Tek satır ekle veya güncelle (diğer satırlara dokunmaz). */
export async function adminUpsertTahsilatRow(
  resource: string,
  input: {
    id?: string | number | null;
    active?: boolean;
    data?: Record<string, unknown>;
  },
) {
  if (!isTahsilatResource(resource)) {
    throw new InputError("Bilinmeyen Tahsilat kaynağı", 404);
  }
  if (!input || typeof input !== "object") throw new InputError("Satır gerekli");

  const category = await ensureTahsilatResource(resource);
  const schema = await getSchema(category.id);
  const tableName =
    (schema.category as { tableName?: string }).tableName || category.table_name;
  if (!tableName) throw new InputError("Tablo adı bulunamadı", 500);

  const fields = mapIncomingData(schema, input.data && typeof input.data === "object" ? input.data : {});
  const active = input.active === false ? 0 : 1;
  const idRaw = input.id == null ? "" : String(input.id);
  const existingId = /^[1-9]\d*$/.test(idRaw) ? Number(idRaw) : null;

  if (existingId) {
    const [found] = await pool.query<any[]>(
      `SELECT id FROM ${identifier(tableName)} WHERE id=? LIMIT 1`,
      [existingId],
    );
    if (!found[0]) throw new InputError("Kayıt bulunamadı", 404);
    if (fields.length) {
      const sets = ["active=?", ...fields.map((f) => `${identifier(f.sqlName)}=?`)];
      const values = [active, ...fields.map((f) => toSqlValue(f.value, f.fieldType)), existingId];
      await pool.query(
        `UPDATE ${identifier(tableName)} SET ${sets.join(",")} WHERE id=?`,
        values,
      );
    } else {
      await pool.query(`UPDATE ${identifier(tableName)} SET active=? WHERE id=?`, [active, existingId]);
    }
  } else {
    const names = ["active", ...fields.map((f) => f.sqlName)];
    const values = [active, ...fields.map((f) => toSqlValue(f.value, f.fieldType))];
    await pool.query(
      `INSERT INTO ${identifier(tableName)} (${names.map(identifier).join(",")}) VALUES (${names.map(() => "?").join(",")})`,
      values,
    );
  }

  return adminListTahsilat(resource);
}

/** Tek satır sil (diğer satırlara dokunmaz). */
export async function adminDeleteTahsilatRow(resource: string, id: string) {
  if (!isTahsilatResource(resource)) {
    throw new InputError("Bilinmeyen Tahsilat kaynağı", 404);
  }
  if (!/^[1-9]\d*$/.test(String(id))) throw new InputError("Geçersiz kayıt id");

  const category = await ensureTahsilatResource(resource);
  const schema = await getSchema(category.id);
  const tableName =
    (schema.category as { tableName?: string }).tableName || category.table_name;
  if (!tableName) throw new InputError("Tablo adı bulunamadı", 500);

  const [result] = await pool.query<any>(
    `DELETE FROM ${identifier(tableName)} WHERE id=?`,
    [Number(id)],
  );
  if (!result?.affectedRows) throw new InputError("Kayıt bulunamadı veya silinemedi", 404);
  return adminListTahsilat(resource);
}

/** Toplu yazım (ilçe toplu ekleme vb.) — yalnızca gönderilen satırlar eklenir/güncellenir; silme yok. */
export async function adminBulkUpsertTahsilat(
  resource: string,
  inputRows: Array<{
    id?: string | number | null;
    active?: boolean;
    data?: Record<string, unknown>;
  }>,
) {
  if (!Array.isArray(inputRows) || !inputRows.length) {
    throw new InputError("En az bir satır gerekli");
  }
  if (inputRows.length > 5000) throw new InputError("En fazla 5000 satır");
  for (const row of inputRows) {
    await adminUpsertTahsilatRow(resource, row);
  }
  return adminListTahsilat(resource);
}
