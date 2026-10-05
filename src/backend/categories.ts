import { addForeignKey, columnName, ensurePhysicalTable, identifier, initDatabase, pool, sqlType, tableName, withTransaction, type CategoryFolderRow, type CategoryRow, type ColumnRow } from "./database.js";

export type FieldType = "text" | "number" | "boolean" | "date" | "relation" | "image";
const fieldTypes = new Set<FieldType>(["text", "number", "boolean", "date", "relation", "image"]);
const categoryIcons = new Set([
  "code", "home", "briefcase", "pulse", "pay", "chart", "sliders", "gear",
  "book", "boxes", "building", "calendar", "cloud", "data", "document",
  "folder", "globe", "key", "layers", "link", "map", "package",
  "server", "shield", "shop", "tag", "user", "users", "zap",
]);
export class InputError extends Error { constructor(message: string, public status = 400) { super(message); } }

const visibleCategory = (row: CategoryRow, folderPath = "") => ({
  id: row.id, name: row.name, slug: row.slug, tableName: row.table_name || tableName(row.id, row.name),
  icon: categoryIcons.has(row.icon) ? row.icon : "code", active: Boolean(row.active),
  folderId: row.folder_id === null ? null : Number(row.folder_id), folderPath,
  createdAt: row.created_at, updatedAt: row.updated_at,
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
  const [[rows], [folders]] = await Promise.all([
    pool.query<CategoryRow[]>("SELECT * FROM api_categories ORDER BY name"),
    pool.query<CategoryFolderRow[]>("SELECT * FROM api_category_folders ORDER BY name"),
  ]);
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const pathFor = (folderId: number | null) => {
    const path: string[] = [];
    const visited = new Set<number>();
    let current = folderId === null ? undefined : byId.get(Number(folderId));
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current.name);
      current = current.parent_id === null ? undefined : byId.get(Number(current.parent_id));
    }
    return path.join(" / ");
  };
  return rows.map(row => visibleCategory(row, pathFor(row.folder_id)));
}

export async function categoryFolders() {
  await initDatabase();
  const [rows] = await pool.query<CategoryFolderRow[]>("SELECT * FROM api_category_folders ORDER BY name");
  return rows.map(row => ({ id: row.id, name: row.name, parentId: row.parent_id === null ? null : Number(row.parent_id) }));
}

export async function createCategoryFolder(nameInput: unknown, parentInput: unknown) {
  await initDatabase();
  const name = String(nameInput || "").trim();
  const parentId = parentInput === null || parentInput === undefined || parentInput === "" ? null : Number(parentInput);
  if (!name || name.length > 120 || (parentId !== null && !Number.isSafeInteger(parentId))) throw new InputError("Klasör adı veya üst klasör geçersiz");
  if (parentId !== null) {
    const [parent] = await pool.query<any[]>("SELECT id FROM api_category_folders WHERE id=? LIMIT 1", [parentId]);
    if (!parent[0]) throw new InputError("Üst klasör bulunamadı", 404);
  }
  const [duplicate] = parentId === null
    ? await pool.query<any[]>("SELECT id FROM api_category_folders WHERE name=? AND parent_id IS NULL LIMIT 1", [name])
    : await pool.query<any[]>("SELECT id FROM api_category_folders WHERE name=? AND parent_id=? LIMIT 1", [name, parentId]);
  if (duplicate[0]) throw new InputError("Bu konumda aynı adlı klasör zaten var", 409);
  return withTransaction(async connection => {
    const [result] = await connection.query<any>("INSERT INTO api_category_folders(name,parent_id) VALUES(?,?)", [name, parentId]);
    const id = Number(result.insertId);
    await connection.query("INSERT INTO api_category_folder_closure(ancestor_id,descendant_id) VALUES(?,?)", [id, id]);
    if (parentId !== null) await connection.query(
      "INSERT INTO api_category_folder_closure(ancestor_id,descendant_id) SELECT ancestor_id,? FROM api_category_folder_closure WHERE descendant_id=?",
      [id, parentId],
    );
    return { id, name, parentId };
  });
}

export async function apiKeyForCategory(apiKey: string, categoryId: number) {
  await initDatabase();
  const [rows] = await pool.query<any[]>(`SELECT k.id FROM api_keys k
  WHERE k.api_key=? AND k.active=1 AND (
    EXISTS (SELECT 1 FROM api_key_categories kc WHERE kc.api_key_id=k.id AND kc.category_id=?)
    OR EXISTS (SELECT 1 FROM api_categories c
      JOIN api_category_folder_closure scope ON scope.descendant_id=c.folder_id
      JOIN api_key_folders kf ON kf.folder_id=scope.ancestor_id AND kf.api_key_id=k.id
      WHERE c.id=?)
  ) LIMIT 1`, [apiKey, categoryId, categoryId]);
  return rows[0] as { id: string } | undefined;
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

export async function createCategory(name: string, slugInput: string, folderInput?: unknown) {
  await initDatabase();
  name = name.trim();
  const slug = normalizeSlug(slugInput || name);
  if (!name || name.length > 120 || !slug) throw new InputError("Geçerli bir kategori adı girin");
  const folderId = folderInput === null || folderInput === undefined || folderInput === "" ? null : Number(folderInput);
  if (folderId !== null && !Number.isSafeInteger(folderId)) throw new InputError("Klasör seçimi geçersiz");
  if (folderId !== null) {
    const [folder] = await pool.query<any[]>("SELECT id FROM api_category_folders WHERE id=? LIMIT 1", [folderId]);
    if (!folder[0]) throw new InputError("Klasör bulunamadı", 404);
  }
  const sqlTable = tableName(0, name);
  const [used] = await pool.query<any[]>("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1", [sqlTable]);
  if (used.length) throw new InputError("Bu kategori adı bir MySQL tablosunda zaten kullanılıyor", 409);
  const [result] = await pool.query<any>("INSERT INTO api_categories(name,slug,active,folder_id) VALUES (?,?,1,?)", [name, slug, folderId]);
  const id = Number(result.insertId);
  try { await ensurePhysicalTable(await categoryById(id)); }
  catch (error) { await pool.query("DELETE FROM api_categories WHERE id=?", [id]); throw error; }
  return visibleCategory(await categoryById(id));
}

export async function updateCategory(id: number, input: { name?: unknown; active?: unknown; icon?: unknown; folderId?: unknown }) {
  const category = await categoryById(id);
  const name = input.name === undefined ? category.name : String(input.name).trim();
  const active = input.active === undefined ? Boolean(category.active) : input.active;
  const icon = input.icon === undefined ? category.icon || "code" : String(input.icon);
  const folderId = input.folderId === undefined ? category.folder_id : input.folderId === null || input.folderId === "" ? null : Number(input.folderId);
  if (!name || name.length > 120 || typeof active !== "boolean") throw new InputError("Kategori bilgileri geçersiz");
  if (folderId !== null && !Number.isSafeInteger(folderId)) throw new InputError("Klasör seçimi geçersiz");
  if (!categoryIcons.has(icon)) throw new InputError("Kategori ikonu geçersiz");
  if (folderId !== null) {
    const [folder] = await pool.query<any[]>("SELECT id FROM api_category_folders WHERE id=? LIMIT 1", [folderId]);
    if (!folder[0]) throw new InputError("Klasör bulunamadı", 404);
  }
  const nextTable = tableName(id, name);
  if (nextTable !== category.table_name) {
    const [used] = await pool.query<any[]>("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1", [nextTable]);
    if (used.length) throw new InputError("Bu kategori adı bir MySQL tablosunda zaten kullanılıyor", 409);
    await pool.query(`RENAME TABLE ${identifier(category.table_name!)} TO ${identifier(nextTable)}`);
  }
  try { await pool.query("UPDATE api_categories SET name=?,active=?,table_name=?,icon=?,folder_id=? WHERE id=?", [name, active ? 1 : 0, nextTable, icon, folderId, id]); }
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
    const number = String(value).trim().replace(",", ".");
    if (!/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(number)) throw new InputError("Sayı en fazla 14 tam ve 6 ondalık basamak içermeli");
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
  if (fieldType === "image") {
    const image = String(value);
    if (!/^\/uploads\/images\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/.test(image) &&
        !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      throw new InputError("Görsel alanı geçersiz");
    }
    if (image.length > 1_450_000) throw new InputError("Görsel en fazla 1 MB olabilir");
    return image;
  }
  return String(value);
}

async function rowValues(table: string, fields: ColumnRow[], publicOnly: boolean) {
  const [rows] = await pool.query<any[]>(`SELECT * FROM ${identifier(table)} ${publicOnly ? "WHERE active=1" : ""} ORDER BY id`);
  return rows.map(row => ({
    id: String(row.id), active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at,
    data: Object.fromEntries(fields.map(field => {
      const value = row[field.sql_name!];
      const display = field.field_type === "number" && value !== null
        ? String(value).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
        : String(value);
      return [String(field.id), value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : value === null ? "" : display];
    })),
  }));
}

export async function getSchema(categoryId: number) {
  const category = await categoryById(categoryId);
  const fields = await columnRows(categoryId);
  const rows = await rowValues(category.table_name!, fields, false);
  const relationOptions: Record<number, { id: string; label: string; detail: string }[]> = {};
  for (const referenceId of new Set(fields.map(field => field.reference_category_id).filter((id): id is number => Boolean(id)))) {
    relationOptions[referenceId] = await relationChoices(referenceId);
  }
  return { category: visibleCategory(category), columns: fields.map(visibleColumn), rows, relationOptions };
}

export async function relationChoices(categoryId: number) {
  const target = await categoryById(categoryId);
  const fields = (await columnRows(categoryId)).filter(field => field.field_type !== "image");
  const labelField = fields.find(field => field.field_type === "text") || fields[0];
  const selected = fields.map(field => identifier(field.sql_name!));
  const [rows] = await pool.query<any[]>(`SELECT id${selected.length ? `,${selected.join(",")}` : ""} FROM ${identifier(target.table_name!)} ORDER BY id`);
  return rows.map(row => ({
    id: String(row.id),
    label: labelField ? String(row[labelField.sql_name!] ?? row.id) : String(row.id),
    detail: fields.filter(field => field.id !== labelField?.id)
      .map(field => row[field.sql_name!] === null || row[field.sql_name!] === "" ? "" : `${field.name}: ${row[field.sql_name!]}`)
      .filter(Boolean).slice(0, 3).join(" · "),
  }));
}

export async function saveRows(categoryId: number, inputRows: any[]) {
  const category = await categoryById(categoryId);
  const fields = await columnRows(categoryId);
  if (!Array.isArray(inputRows) || inputRows.length > 5000) throw new InputError("Satır listesi geçersiz veya çok büyük");
  const table = identifier(category.table_name!);
  await withTransaction(async connection => {
    const [existing] = await connection.query<any[]>(`SELECT id FROM ${table}`);
    const remaining = new Set(existing.map(row => String(row.id)));
    for (const row of inputRows) {
      const id = typeof row.id === "string" && /^[1-9]\d*$/.test(row.id) && remaining.has(row.id) ? Number(row.id) : null;
      const values = fields.map(field => dataValue(row.data?.[String(field.id)] ?? row.data?.[field.name], field.field_type));
      const names = [...(id === null ? [] : ["id"]), "active", ...fields.map(field => field.sql_name!)];
      const inserts = [...(id === null ? [] : [id]), row.active === false ? 0 : 1, ...values];
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

export async function publicData(category: CategoryRow, baseUrl = "") {
  const fields = await columnRows(category.id);
  const rows = await rowValues(category.table_name!, fields, true);
  return rows.map(row => ({
    id: Number(row.id),
    ...Object.fromEntries(fields.map(field => {
      const value = row.data[String(field.id)] ?? null;
      return [field.name, field.field_type === "image" && typeof value === "string" && value.startsWith("/uploads/")
        ? `${baseUrl}${value}` : value];
    })),
  }));
}
