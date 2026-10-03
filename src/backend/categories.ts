import { addForeignKey, columnName, ensurePhysicalTable, identifier, initDatabase, pool, sqlType, tableName, withTransaction, type CategoryRow, type ColumnRow } from "./database.js";

export type FieldType = "text" | "number" | "boolean" | "date" | "relation";
const fieldTypes = new Set<FieldType>(["text", "number", "boolean", "date", "relation"]);
const categoryIcons = new Set(["code", "home", "briefcase", "pulse", "pay", "chart", "sliders", "gear"]);
export class InputError extends Error { constructor(message: string, public status = 400) { super(message); } }

const visibleCategory = (row: CategoryRow) => ({
  id: row.id, name: row.name, slug: row.slug, tableName: row.table_name || tableName(row.id, row.name),
  icon: categoryIcons.has(row.icon) ? row.icon : "code", active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at,
});
const visibleColumn = (row: ColumnRow) => ({
  id: row.id, name: row.name, sqlName: row.sql_name || columnName(row.id, row.name),
  fieldType: fieldTypes.has(row.field_type as FieldType) ? row.field_type : "text",
  referenceCategoryId: row.reference_category_id, position: row.position,
});

export function normalizeSlug(value: string) {
  return value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export async function categories() {
  await initDatabase();
  const [rows] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories ORDER BY name");
  return rows.map(visibleCategory);
}

export async function categoryById(id: number): Promise<CategoryRow> {
  await initDatabase();
  const [rows] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories WHERE id=? LIMIT 1", [id]);
  if (!rows[0]) throw new InputError("Kategori bulunamadı", 404);
  return rows[0];
}

export async function categoryBySlug(slug: string): Promise<CategoryRow> {
  await initDatabase();
  const [rows] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories WHERE slug=? AND active=1 LIMIT 1", [slug]);
  if (!rows[0]) throw new InputError("Kategori bulunamadı", 404);
  return rows[0];
}

export async function createCategory(name: string, slugInput: string) {
  await initDatabase();
  name = name.trim();
  const slug = normalizeSlug(slugInput || name);
  if (!name || name.length > 120 || !slug) throw new InputError("Geçerli bir kategori adı girin");
  const sqlTable = tableName(0, name);
  const [used] = await pool.query<any[]>("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1", [sqlTable]);
  if (used.length) throw new InputError("Bu kategori adı bir MySQL tablosunda zaten kullanılıyor", 409);
  const [result] = await pool.query<any>("INSERT INTO api_categories(name,slug,active) VALUES (?,?,1)", [name, slug]);
  const id = Number(result.insertId);
  try { await ensurePhysicalTable(await categoryById(id)); }
  catch (error) { await pool.query("DELETE FROM api_categories WHERE id=?", [id]); throw error; }
  return visibleCategory(await categoryById(id));
}

export async function updateCategory(id: number, input: { name?: unknown; active?: unknown; icon?: unknown }) {
  const category = await categoryById(id);
  const name = input.name === undefined ? category.name : String(input.name).trim();
  const active = input.active === undefined ? Boolean(category.active) : input.active;
  const icon = input.icon === undefined ? category.icon || "code" : String(input.icon);
  if (!name || name.length > 120 || typeof active !== "boolean") throw new InputError("Kategori bilgileri geçersiz");
  if (!categoryIcons.has(icon)) throw new InputError("Kategori ikonu geçersiz");
  const nextTable = tableName(id, name);
  if (nextTable !== category.table_name) {
    const [used] = await pool.query<any[]>("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1", [nextTable]);
    if (used.length) throw new InputError("Bu kategori adı bir MySQL tablosunda zaten kullanılıyor", 409);
    await pool.query(`RENAME TABLE ${identifier(category.table_name!)} TO ${identifier(nextTable)}`);
  }
  try { await pool.query("UPDATE api_categories SET name=?,active=?,table_name=?,icon=? WHERE id=?", [name, active ? 1 : 0, nextTable, icon, id]); }
  catch (error) {
    if (nextTable !== category.table_name) await pool.query(`RENAME TABLE ${identifier(nextTable)} TO ${identifier(category.table_name!)}`);
    throw error;
  }
  return visibleCategory(await categoryById(id));
}

export async function deleteCategory(id: number) {
  const category = await categoryById(id);
  const [references] = await pool.query<any[]>("SELECT COUNT(*) AS total FROM api_category_columns WHERE reference_category_id=?", [id]);
  if (Number(references[0].total)) throw new InputError("Bu kategori başka tablolarda ilişkili alan olarak kullanılıyor", 409);
  await pool.query(`DROP TABLE ${identifier(category.table_name!)}`);
  await pool.query("DELETE FROM api_categories WHERE id=?", [id]);
}

async function columnRows(categoryId: number) {
  const [rows] = await pool.query<ColumnRow[]>("SELECT * FROM api_category_columns WHERE category_id=? ORDER BY position,id", [categoryId]);
  return rows;
}

export async function addColumn(categoryId: number, input: { name: unknown; fieldType?: unknown; referenceCategoryId?: unknown }) {
  const category = await categoryById(categoryId);
  const name = String(input.name || "").trim();
  const fieldType = String(input.fieldType || "text") as FieldType;
  const referenceCategoryId = fieldType === "relation" ? Number(input.referenceCategoryId) : null;
  const sqlName = columnName(0, name);
  if (!name || name.length > 120 || ["id", "legacy_id", "gtk_sort_order", "created_at", "updated_at", "active"].includes(sqlName)) throw new InputError("Geçerli bir sütun adı girin");
  const [usedNames] = await pool.query<any[]>("SELECT name FROM api_category_columns WHERE category_id=?", [categoryId]);
  if (usedNames.some(item => columnName(0, item.name) === sqlName)) throw new InputError("Bu SQL sütun adı zaten kullanılıyor", 409);
  if (!fieldTypes.has(fieldType)) throw new InputError("Sütun türü geçersiz");
  if (fieldType === "relation" && (!referenceCategoryId || referenceCategoryId === categoryId)) throw new InputError("Farklı bir hedef kategori seçin");
  const target = referenceCategoryId ? await categoryById(referenceCategoryId) : null;
  const [positions] = await pool.query<any[]>("SELECT COALESCE(MAX(position),-1)+1 AS nextPosition FROM api_category_columns WHERE category_id=?", [categoryId]);
  const [result] = await pool.query<any>(
    "INSERT INTO api_category_columns(category_id,name,field_type,position,reference_category_id) VALUES (?,?,?,?,?)",
    [categoryId, name, fieldType, positions[0].nextPosition, referenceCategoryId],
  );
  const id = Number(result.insertId);
  try {
    await pool.query(`ALTER TABLE ${identifier(category.table_name!)} ADD COLUMN ${identifier(sqlName)} ${sqlType(fieldType)}`);
    await pool.query("UPDATE api_category_columns SET sql_name=? WHERE id=?", [sqlName, id]);
    if (target) await addForeignKey(category.table_name!, { id, category_id: categoryId, name, sql_name: sqlName, field_type: fieldType, reference_category_id: referenceCategoryId, position: positions[0].nextPosition } as ColumnRow, target.table_name!);
  } catch (error) {
    try { await pool.query(`ALTER TABLE ${identifier(category.table_name!)} DROP COLUMN ${identifier(sqlName)}`); } catch { /* Column may not exist. */ }
    await pool.query("DELETE FROM api_category_columns WHERE id=?", [id]);
    throw error;
  }
  return visibleColumn({ id, category_id: categoryId, name, sql_name: sqlName, field_type: fieldType, reference_category_id: referenceCategoryId, position: positions[0].nextPosition } as ColumnRow);
}

export async function deleteColumn(categoryId: number, columnId: number) {
  const category = await categoryById(categoryId);
  const column = (await columnRows(categoryId)).find(item => item.id === columnId);
  if (!column) throw new InputError("Sütun bulunamadı", 404);
  if (column.field_type === "relation") {
    const constraint = `fk_gtk_${column.id}`;
    const [found] = await pool.query<any[]>("SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? LIMIT 1", [category.table_name, constraint]);
    if (found.length) await pool.query(`ALTER TABLE ${identifier(category.table_name!)} DROP FOREIGN KEY ${identifier(constraint)}`);
  }
  await pool.query(`ALTER TABLE ${identifier(category.table_name!)} DROP COLUMN ${identifier(column.sql_name!)}`);
  await pool.query("DELETE FROM api_category_columns WHERE id=?", [columnId]);
}

function dataValue(value: unknown, fieldType: string) {
  if (value === "" || value === undefined || value === null) return null;
  if (fieldType === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new InputError("Sayısal alana geçerli bir sayı girin");
    return number;
  }
  if (fieldType === "boolean") return value === true || value === "true" || value === "1" || value === 1 ? 1 : 0;
  if (fieldType === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new InputError("Tarih YYYY-AA-GG biçiminde olmalı");
    return String(value);
  }
  if (fieldType === "relation") {
    if (!/^[1-9]\d*$/.test(String(value))) throw new InputError("İlişkili kayıt geçersiz");
    return Number(value);
  }
  return String(value);
}

async function rowValues(table: string, fields: ColumnRow[], publicOnly: boolean) {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${identifier(table)} ${publicOnly ? "WHERE active=1" : ""} ORDER BY gtk_sort_order,id`);
  return rows.map(row => ({
    id: String(row.id), active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at,
    data: Object.fromEntries(fields.map(field => {
      const value = row[field.sql_name!];
      return [String(field.id), value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : value === null ? "" : String(value)];
    })),
  }));
}

export async function getSchema(categoryId: number) {
  const category = await categoryById(categoryId);
  const fields = await columnRows(categoryId);
  const rows = await rowValues(category.table_name!, fields, false);
  const relationOptions: Record<number, { id: string; label: string }[]> = {};
  for (const referenceId of new Set(fields.map(field => field.reference_category_id).filter((id): id is number => Boolean(id)))) {
    const target = await categoryById(referenceId);
    const targetFields = await columnRows(referenceId);
    const labelField = targetFields.find(field => field.field_type === "text") || targetFields[0];
    const [choices] = await pool.query<any[]>(`SELECT id${labelField ? `,${identifier(labelField.sql_name!)} AS label` : ""} FROM ${identifier(target.table_name!)} ORDER BY updated_at DESC`);
    relationOptions[referenceId] = choices.map(choice => ({ id: choice.id, label: String(choice.label || choice.id) }));
  }
  return { category: visibleCategory(category), columns: fields.map(visibleColumn), rows, relationOptions };
}

export async function saveRows(categoryId: number, inputRows: any[]) {
  const category = await categoryById(categoryId);
  const fields = await columnRows(categoryId);
  if (!Array.isArray(inputRows) || inputRows.length > 5000) throw new InputError("Satır listesi geçersiz veya çok büyük");
  const table = identifier(category.table_name!);
  await withTransaction(async connection => {
    const [existing] = await connection.query<any[]>(`SELECT id FROM ${table}`);
    const remaining = new Set(existing.map(row => String(row.id)));
    for (const [position, row] of inputRows.entries()) {
      const id = typeof row.id === "string" && /^[1-9]\d*$/.test(row.id) && remaining.has(row.id) ? Number(row.id) : null;
      const values = fields.map(field => dataValue(row.data?.[String(field.id)] ?? row.data?.[field.name], field.field_type));
      const names = [...(id === null ? [] : ["id"]), "gtk_sort_order", "active", ...fields.map(field => field.sql_name!)];
      const inserts = [...(id === null ? [] : [id]), position, row.active === false ? 0 : 1, ...values];
      await connection.query(`INSERT INTO ${table} (${names.map(identifier).join(",")}) VALUES (${names.map(() => "?").join(",")}) ON DUPLICATE KEY UPDATE ${names.slice(id === null ? 0 : 1).map(name => `${identifier(name)}=VALUES(${identifier(name)})`).join(",")}`, inserts);
      if (id !== null) remaining.delete(String(id));
    }
    for (const id of remaining) await connection.query(`DELETE FROM ${table} WHERE id=?`, [id]);
  });
}

export async function saveSchema(categoryId: number, payload: { columns: any[]; rows: any[] }) {
  await categoryById(categoryId);
  if (!Array.isArray(payload.columns) || !Array.isArray(payload.rows)) throw new InputError("Tablo verisi geçersiz");
  const current = await columnRows(categoryId);
  const currentIds = new Set(current.map(field => field.id));
  const normalizedNames = new Set<string>();
  const normalizedSqlNames = new Set<string>();
  const draftIds = new Set<number>();
  for (const column of payload.columns) {
    const name = String(column.name || "").trim();
    const key = name.toLocaleLowerCase("tr-TR");
    if (!name || name.length > 120 || ["id", "created_at", "updated_at", "active"].includes(key) || normalizedNames.has(key)) throw new InputError("Sütun adı boş, geçersiz veya tekrar ediyor");
    normalizedNames.add(key);
    const sqlName = columnName(0, name);
    if (["id", "legacy_id", "gtk_sort_order", "active", "created_at", "updated_at"].includes(sqlName) || normalizedSqlNames.has(sqlName)) throw new InputError("SQL sütun adları tekrar ediyor veya ayrılmış bir ad kullanılıyor");
    normalizedSqlNames.add(sqlName);
    const id = Number(column.id);
    if (!Number.isSafeInteger(id) || id === 0) throw new InputError("Sütun kimliği geçersiz");
    if (id < 0) {
      if (draftIds.has(id)) throw new InputError("Taslak sütun kimliği tekrar ediyor");
      draftIds.add(id);
      if (!fieldTypes.has(column.fieldType)) throw new InputError("Sütun türü geçersiz");
      if (column.fieldType === "relation") {
        const targetId = Number(column.referenceCategoryId);
        if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === categoryId) throw new InputError("Geçerli bir hedef kategori seçin");
        await categoryById(targetId);
      }
    } else {
      if (!currentIds.has(id)) throw new InputError("Sütun kimliği geçersiz");
      const old = current.find(field => field.id === id)!;
      if (column.fieldType !== old.field_type || Number(column.referenceCategoryId || 0) !== Number(old.reference_category_id || 0)) throw new InputError("Mevcut sütunun türü ve ilişkisi değiştirilemez; yeni sütun oluşturun");
    }
  }
  const temporaryIds = new Map<number, number>();
  for (const column of payload.columns) {
    if (Number(column.id) <= 0) {
      const created = await addColumn(categoryId, column);
      temporaryIds.set(Number(column.id), created.id);
    } else {
      const old = current.find(field => field.id === Number(column.id))!;
      if (column.name !== old.name) await pool.query("UPDATE api_category_columns SET name=? WHERE id=?", [String(column.name).trim(), old.id]);
    }
  }
  const mappedRows = payload.rows.map(row => ({
    ...row,
    data: Object.fromEntries(Object.entries(row.data || {}).map(([key, value]) => [String(temporaryIds.get(Number(key)) ?? key), value])),
  }));
  const keep = new Set(payload.columns.map(column => temporaryIds.get(Number(column.id)) ?? Number(column.id)));
  for (const column of current) if (!keep.has(column.id)) await deleteColumn(categoryId, column.id);
  await saveRows(categoryId, mappedRows);
  return getSchema(categoryId);
}

export async function publicData(category: CategoryRow) {
  const fields = await columnRows(category.id);
  const rows = await rowValues(category.table_name!, fields, true);
  return rows.map(row => ({
    id: Number(row.id),
    ...Object.fromEntries(fields.map(field => [field.name, row.data[String(field.id)] || null])),
  }));
}
