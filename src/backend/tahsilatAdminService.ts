/**
 * Tahsilat panel → MySQL.
 * Satır ekle / güncelle / sil — tam liste replace riskli olduğu için tekil CRUD.
 */
import { randomUUID } from "crypto";
import { getSchema, InputError } from "./categories.js";
import { identifier, pool } from "./database.js";
import {
  ensureTahsilatFolderId,
  ensureTahsilatResource,
  isTahsilatResource,
  type TahsilatResource,
} from "./tahsilatCatalog.js";

export type TahsilatAdminRow = {
  id: string;
  active: boolean;
  data: Record<string, string | number | boolean | null>;
};

async function recordTahsilatChange(
  resource: string,
  action: "create" | "update" | "delete",
  rowId: string,
  summary: string,
) {
  try {
    await pool.query(
      `INSERT INTO api_tahsilat_change_log (resource, action, row_id, summary) VALUES (?,?,?,?)`,
      [resource, action, String(rowId || ""), String(summary || "").slice(0, 512)],
    );
  } catch (err) {
    console.warn("[tahsilat] change log yazılamadı:", err);
  }
}

function summarizeRow(
  resource: string,
  action: string,
  rowId: string,
  data?: Record<string, unknown> | null,
) {
  const pick = (...keys: string[]) => {
    if (!data) return "";
    for (const key of keys) {
      const hit = Object.entries(data).find(
        ([name]) => columnKey(name) === columnKey(key),
      );
      if (hit?.[1] != null && String(hit[1]).trim()) return String(hit[1]).trim();
    }
    return "";
  };
  const label =
    pick("name", "adi", "bin", "code", "shortName") ||
    (rowId ? `#${rowId}` : "");
  const verb =
    action === "create" ? "eklendi" : action === "delete" ? "silindi" : "güncellendi";
  return `${resource}: ${label} ${verb}`.slice(0, 512);
}

export async function listTahsilatChangeLog(limit = 100) {
  const safe = Math.min(500, Math.max(1, Number(limit) || 100));
  const [rows] = await pool.query<any[]>(
    `SELECT id, resource, action, row_id AS rowId, summary, created_at AS createdAt
     FROM api_tahsilat_change_log
     ORDER BY id DESC
     LIMIT ?`,
    [safe],
  );
  return (rows || []).map((r) => ({
    id: String(r.id),
    resource: String(r.resource || ""),
    action: String(r.action || ""),
    rowId: String(r.rowId || ""),
    summary: String(r.summary || ""),
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt || ""),
  }));
}

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

  const incomingData = input.data && typeof input.data === "object" ? input.data : {};
  const fields = mapIncomingData(schema, incomingData);
  const active = input.active === false ? 0 : 1;
  const idRaw = input.id == null ? "" : String(input.id);
  const existingId = /^[1-9]\d*$/.test(idRaw) ? Number(idRaw) : null;
  let action: "create" | "update" = existingId ? "update" : "create";
  let rowId = existingId ? String(existingId) : "";

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
    const [inserted] = await pool.query<any>(
      `INSERT INTO ${identifier(tableName)} (${names.map(identifier).join(",")}) VALUES (${names.map(() => "?").join(",")})`,
      values,
    );
    rowId = inserted?.insertId ? String(inserted.insertId) : "";
    action = "create";
    if (resource === "companies" && inserted?.insertId) {
      await issueCompanyApiKey(String(inserted.insertId), { forceNew: true });
    }
  }

  if (resource === "companies" && existingId) {
    await ensureCompanyApiKey(String(existingId));
  }

  await recordTahsilatChange(
    resource,
    action,
    rowId,
    summarizeRow(resource, action, rowId, incomingData as Record<string, unknown>),
  );

  return adminListTahsilat(resource);
}

async function companyTableMeta() {
  const category = await ensureTahsilatResource("companies");
  const schema = await getSchema(category.id);
  const tableName =
    (schema.category as { tableName?: string }).tableName || category.table_name;
  if (!tableName) throw new InputError("Firma tablosu bulunamadı", 500);
  const colByName = new Map(schema.columns.map((c) => [columnKey(c.name), c]));
  const apiKeyCol = colByName.get(columnKey("apiKey"));
  const apiKeyIdCol = colByName.get(columnKey("apiKeyId"));
  if (!apiKeyCol || !apiKeyIdCol) {
    throw new InputError("Firma API Key sütunları eksik — kataloğu yenileyin", 500);
  }
  return {
    tableName,
    apiKeySql: apiKeyCol.sqlName || apiKeyCol.name,
    apiKeyIdSql: apiKeyIdCol.sqlName || apiKeyIdCol.name,
    nameCol: colByName.get(columnKey("name")),
    domainCol: colByName.get(columnKey("domain")),
    columns: colByName,
  };
}

/** Resolve a tenant database only from a previously authenticated company API key. */
export async function tenantDatabaseForApiKeyId(keyId: string) {
  if (!keyId || keyId.length > 64) throw new InputError("Firma anahtarı geçersiz", 401);
  const meta = await companyTableMeta();
  const col = (name: string) => {
    const hit = meta.columns.get(columnKey(name));
    if (!hit) throw new InputError(`Firma ${name} alanı eksik`, 503);
    return identifier(hit.sqlName || hit.name);
  };
  const [rows] = await pool.query<any[]>(
    `SELECT id, ${col("name")} AS companyName, ${col("domain")} AS domain,
      ${col("domainActive")} AS domainActive,
      ${col("dbHost")} AS dbHost, ${col("dbPort")} AS dbPort,
      ${col("dbName")} AS dbName, ${col("dbUser")} AS dbUser,
      ${col("dbPassword")} AS dbPassword, ${col("dbActive")} AS dbActive
     FROM ${identifier(meta.tableName)}
     WHERE ${identifier(meta.apiKeyIdSql)}=? AND active=1 LIMIT 2`,
    [keyId],
  );
  const row = rows[0];
  const enabled = [true, 1, "1", "true", "yes", "evet"].includes(
    typeof row?.dbActive === "string" ? row.dbActive.toLowerCase() : row?.dbActive,
  );
  const domainEnabled = [true, 1, "1", "true", "yes", "evet"].includes(
    typeof row?.domainActive === "string" ? row.domainActive.toLowerCase() : row?.domainActive,
  );
  if (rows.length !== 1 || !row || !enabled || !domainEnabled || !row.domain || !row.dbHost || !row.dbName || !row.dbUser || !row.dbPassword) {
    throw new InputError("Bu API anahtarı için aktif firma veritabanı bulunamadı", 403);
  }
  return {
    companyId: String(row.id),
    companyName: String(row.companyName || ""),
    domain: String(row.domain || ""),
    host: String(row.dbHost),
    port: Number(row.dbPort) || 3306,
    database: String(row.dbName),
    user: String(row.dbUser),
    password: String(row.dbPassword),
  };
}

/** Firma için Tahsilat klasörüne yetkili gtk_ anahtarı üret / yenile */
export async function issueCompanyApiKey(
  companyId: string,
  options: { forceNew?: boolean } = {},
) {
  if (!/^[1-9]\d*$/.test(companyId)) throw new InputError("Geçersiz firma id");
  const meta = await companyTableMeta();
  const [rows] = await pool.query<any[]>(
    `SELECT id, ${identifier(meta.apiKeySql)} AS apiKey, ${identifier(meta.apiKeyIdSql)} AS apiKeyId
     ${meta.nameCol ? `, ${identifier(meta.nameCol.sqlName || meta.nameCol.name)} AS companyName` : ""}
     ${meta.domainCol ? `, ${identifier(meta.domainCol.sqlName || meta.domainCol.name)} AS domain` : ""}
     FROM ${identifier(meta.tableName)} WHERE id=? LIMIT 1`,
    [Number(companyId)],
  );
  const row = rows[0];
  if (!row) throw new InputError("Firma bulunamadı", 404);

  const folderId = await ensureTahsilatFolderId();
  if (!folderId) throw new InputError("Tahsilat klasörü oluşturulamadı", 500);

  const projectName = String(row.companyName || row.domain || `Firma #${companyId}`).slice(0, 120);
  const existingKeyId = String(row.apiKeyId || "").trim();
  let keyId = existingKeyId;
  let apiKey = `gtk_${randomUUID().replace(/-/g, "")}`;

  if (existingKeyId && !options.forceNew) {
    const [keys] = await pool.query<any[]>(
      "SELECT id, api_key FROM api_keys WHERE id=? LIMIT 1",
      [existingKeyId],
    );
    if (keys[0]) {
      await pool.query(
        `UPDATE ${identifier(meta.tableName)} SET ${identifier(meta.apiKeySql)}=?, ${identifier(meta.apiKeyIdSql)}=? WHERE id=?`,
        [keys[0].api_key, keys[0].id, Number(companyId)],
      );
      return { apiKey: String(keys[0].api_key), apiKeyId: String(keys[0].id) };
    }
  }

  if (existingKeyId && options.forceNew) {
    await pool.query("UPDATE api_keys SET api_key=? WHERE id=?", [apiKey, existingKeyId]);
    keyId = existingKeyId;
  } else {
    keyId = randomUUID();
    await pool.query(
      "INSERT INTO api_keys(id,project_name,api_key,active,minute_limit,month_limit) VALUES(?,?,?,1,NULL,NULL)",
      [keyId, `Tahsilat · ${projectName}`, apiKey],
    );
  }

  await pool.query("DELETE FROM api_key_folders WHERE api_key_id=?", [keyId]);
  await pool.query("INSERT INTO api_key_folders(api_key_id,folder_id) VALUES(?,?)", [keyId, folderId]);

  await pool.query(
    `UPDATE ${identifier(meta.tableName)} SET ${identifier(meta.apiKeySql)}=?, ${identifier(meta.apiKeyIdSql)}=? WHERE id=?`,
    [apiKey, keyId, Number(companyId)],
  );

  return { apiKey, apiKeyId: keyId };
}

/** Anahtar yoksa üret; varsa olduğu gibi bırak */
export async function ensureCompanyApiKey(companyId: string) {
  if (!/^[1-9]\d*$/.test(companyId)) throw new InputError("Geçersiz firma id");
  const meta = await companyTableMeta();
  const [rows] = await pool.query<any[]>(
    `SELECT ${identifier(meta.apiKeySql)} AS apiKey, ${identifier(meta.apiKeyIdSql)} AS apiKeyId
     FROM ${identifier(meta.tableName)} WHERE id=? LIMIT 1`,
    [Number(companyId)],
  );
  if (!rows[0]) throw new InputError("Firma bulunamadı", 404);
  if (String(rows[0].apiKey || "").trim() && String(rows[0].apiKeyId || "").trim()) {
    return { apiKey: String(rows[0].apiKey), apiKeyId: String(rows[0].apiKeyId) };
  }
  return issueCompanyApiKey(companyId, { forceNew: true });
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
  await recordTahsilatChange(
    resource,
    "delete",
    String(id),
    summarizeRow(resource, "delete", String(id), null),
  );
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
