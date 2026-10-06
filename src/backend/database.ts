import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL tanımlı değil");
export const pool = mysql.createPool(databaseUrl);

export interface CategoryRow extends RowDataPacket { id: number; name: string; slug: string; table_name: string | null; icon: string; active: number; folder_id: number | null; created_at: Date; updated_at: Date }
export interface ColumnRow extends RowDataPacket { id: number; category_id: number; name: string; sql_name: string | null; field_type: string; reference_category_id: number | null; position: number }
export interface CategoryFolderRow extends RowDataPacket { id: number; name: string; parent_id: number | null; created_at: Date }

export function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new Error("Geçersiz SQL tanımlayıcısı");
  return `\`${value}\``;
}

const ascii = (value: string) => value.toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
  .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const tableName = (_id: number, name: string) => ascii(name).slice(0, 64) || "kategori";
export const columnName = (_id: number, name: string) => ascii(name).slice(0, 64) || "alan";

async function hasColumn(table: string, column: string) {
  const [rows] = await pool.query<any[]>(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function hasTable(table: string) {
  const [rows] = await pool.query<any[]>(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1",
    [table],
  );
  return rows.length > 0;
}

async function addMetadataColumn(table: string, column: string, definition: string) {
  if (!await hasColumn(table, column)) await pool.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`);
}

async function apiKeyIdDefinition() {
  const [columns] = await pool.query<any[]>(
    "SELECT COLUMN_TYPE columnType,CHARACTER_SET_NAME characterSet,COLLATION_NAME collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='api_keys' AND COLUMN_NAME='id' LIMIT 1",
  );
  const column = columns[0];
  if (!column || !/^(?:char|varchar)\(\d+\)$/i.test(column.columnType)) {
    throw new Error("api_keys.id sütununun türü api_key_folders tablosu için desteklenmiyor");
  }
  const characterSet = String(column.characterSet || "");
  const collation = String(column.collation || "");
  if (!/^[a-z0-9_]+$/i.test(characterSet) || !/^[a-z0-9_]+$/i.test(collation)) {
    throw new Error("api_keys.id karakter kümesi veya collation bilgisi geçersiz");
  }
  return `${column.columnType} CHARACTER SET ${characterSet} COLLATE ${collation}`;
}

export function sqlType(fieldType: string): string {
  switch (fieldType) {
    case "number": return "DECIMAL(20,6) NULL";
    case "integer": return "INT NULL";
    case "float": return "DOUBLE NULL";
    case "boolean": return "TINYINT(1) NULL";
    case "boolean_text": return "VARCHAR(5) NULL";
    case "date": return "DATE NULL";
    case "relation": return "BIGINT UNSIGNED NULL";
    default: return "LONGTEXT NULL";
  }
}

export async function ensurePhysicalTable(category: CategoryRow) {
  const name = category.table_name || tableName(category.id, category.name);
  identifier(name);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${identifier(name)} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  if (!category.table_name) await pool.query("UPDATE api_categories SET table_name=? WHERE id=?", [name, category.id]);
  return name;
}

export async function addForeignKey(table: string, column: ColumnRow, targetTable: string) {
  const constraint = `fk_gtk_${column.id}`;
  const [found] = await pool.query<any[]>(
    "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? LIMIT 1",
    [table, constraint],
  );
  if (!found.length) await pool.query(`ALTER TABLE ${identifier(table)} ADD CONSTRAINT ${identifier(constraint)} FOREIGN KEY (${identifier(column.sql_name!)}) REFERENCES ${identifier(targetTable)}(id) ON DELETE SET NULL ON UPDATE CASCADE`);
}

async function createMetadata() {
  await pool.query(`CREATE TABLE IF NOT EXISTS api_category_folders (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, parent_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category_folders_parent (parent_id),
    CONSTRAINT fk_category_folder_parent FOREIGN KEY (parent_id) REFERENCES api_category_folders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_category_folder_closure (
    ancestor_id INT NOT NULL, descendant_id INT NOT NULL,
    PRIMARY KEY (ancestor_id,descendant_id),
    INDEX idx_category_folder_descendant (descendant_id),
    CONSTRAINT fk_folder_closure_ancestor FOREIGN KEY (ancestor_id) REFERENCES api_category_folders(id) ON DELETE CASCADE,
    CONSTRAINT fk_folder_closure_descendant FOREIGN KEY (descendant_id) REFERENCES api_category_folders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_categories (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL UNIQUE,
    active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_category_columns (
    id INT AUTO_INCREMENT PRIMARY KEY, category_id INT NOT NULL, name VARCHAR(120) NOT NULL,
    field_type VARCHAR(24) NOT NULL DEFAULT 'text', position INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_category_column (category_id,name),
    CONSTRAINT fk_api_column_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_keys (
    id CHAR(36) PRIMARY KEY, project_name VARCHAR(160) NOT NULL,
    api_key VARCHAR(96) NOT NULL UNIQUE, active TINYINT(1) NOT NULL DEFAULT 1,
    minute_limit INT UNSIGNED NULL, month_limit INT UNSIGNED NULL,
    minute_reset_log_id BIGINT UNSIGNED NOT NULL DEFAULT 0, month_reset_log_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_key_categories (
    api_key_id CHAR(36) NOT NULL, category_id INT NOT NULL,
    PRIMARY KEY (api_key_id,category_id),
    CONSTRAINT fk_key_category_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    CONSTRAINT fk_key_category_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const apiKeyId = await apiKeyIdDefinition();
  await pool.query(`CREATE TABLE IF NOT EXISTS api_key_folders (
    api_key_id ${apiKeyId} NOT NULL, folder_id INT NOT NULL,
    PRIMARY KEY (api_key_id,folder_id),
    CONSTRAINT fk_key_folder_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    CONSTRAINT fk_key_folder_folder FOREIGN KEY (folder_id) REFERENCES api_category_folders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_usage_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, api_key_id CHAR(36) NOT NULL,
    category_id INT NULL, folder_id INT NULL, origin_host VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_usage_key (api_key_id), INDEX idx_usage_key_time (api_key_id,created_at), INDEX idx_usage_category (category_id),
    CONSTRAINT fk_usage_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    CONSTRAINT fk_usage_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_login_settings (
    id INT PRIMARY KEY, theme VARCHAR(12) NOT NULL DEFAULT 'light',
    quick_login_enabled TINYINT(1) NOT NULL DEFAULT 1, image_data LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_smtp_settings (
    id INT PRIMARY KEY, host VARCHAR(255) NOT NULL, port SMALLINT UNSIGNED NOT NULL,
    secure TINYINT(1) NOT NULL DEFAULT 0, user VARCHAR(255) NOT NULL, from_address VARCHAR(255) NOT NULL,
    password_ciphertext TEXT NULL, password_iv VARCHAR(32) NULL, password_tag VARCHAR(32) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_panel_preferences (
    id INT PRIMARY KEY, sidebar_order JSON NOT NULL, quick_access JSON NOT NULL,
    search_width SMALLINT UNSIGNED NOT NULL DEFAULT 300, font_family VARCHAR(32) NOT NULL DEFAULT 'inter',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query("CREATE TABLE IF NOT EXISTS api_settings (id INT PRIMARY KEY, value VARCHAR(16) NOT NULL)");
  await pool.query("CREATE TABLE IF NOT EXISTS api_migration_state (name VARCHAR(80) PRIMARY KEY, completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  await addMetadataColumn("api_categories", "table_name", "VARCHAR(64) NULL UNIQUE");
  await addMetadataColumn("api_categories", "icon", "VARCHAR(24) NOT NULL DEFAULT 'code'");
  await addMetadataColumn("api_categories", "updated_at", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  await addMetadataColumn("api_categories", "folder_id", "INT NULL");
  const [folderConstraint] = await pool.query<any[]>(
    "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='api_categories' AND CONSTRAINT_NAME='fk_api_category_folder' LIMIT 1",
  );
  if (!folderConstraint.length) await pool.query("ALTER TABLE api_categories ADD CONSTRAINT fk_api_category_folder FOREIGN KEY (folder_id) REFERENCES api_category_folders(id) ON DELETE SET NULL");
  await addMetadataColumn("api_panel_preferences", "font_family", "VARCHAR(32) NOT NULL DEFAULT 'inter'");
  await addMetadataColumn("api_usage_logs", "folder_id", "INT NULL");
  await addMetadataColumn("api_keys", "minute_limit", "INT UNSIGNED NULL");
  await addMetadataColumn("api_keys", "month_limit", "INT UNSIGNED NULL");
  await addMetadataColumn("api_keys", "minute_reset_log_id", "BIGINT UNSIGNED NOT NULL DEFAULT 0");
  await addMetadataColumn("api_keys", "month_reset_log_id", "BIGINT UNSIGNED NOT NULL DEFAULT 0");
  const [quotaIndex] = await pool.query<any[]>("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='api_usage_logs' AND INDEX_NAME='idx_usage_key_time' LIMIT 1");
  if (!quotaIndex.length) await pool.query("ALTER TABLE api_usage_logs ADD INDEX idx_usage_key_time (api_key_id,created_at)");
  const [usageFolderConstraint] = await pool.query<any[]>(
    "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='api_usage_logs' AND CONSTRAINT_NAME='fk_usage_folder' LIMIT 1",
  );
  if (!usageFolderConstraint.length) await pool.query("ALTER TABLE api_usage_logs ADD CONSTRAINT fk_usage_folder FOREIGN KEY (folder_id) REFERENCES api_category_folders(id) ON DELETE SET NULL");
  await addMetadataColumn("api_category_columns", "sql_name", "VARCHAR(64) NULL");
  await addMetadataColumn("api_category_columns", "reference_category_id", "INT NULL");
  await pool.query("UPDATE api_category_columns SET field_type='text' WHERE field_type NOT IN ('text','number','integer','float','boolean','boolean_text','date','relation','image','image_upload','image_base64')");
}

// First bring installations that still store rows as JSON to the previous physical format.
async function ensureLegacyTable(category: CategoryRow) {
  const name = category.table_name || `gtk_${category.id}_${ascii(category.name).slice(0, 45) || "kategori"}`;
  await pool.query(`CREATE TABLE IF NOT EXISTS ${identifier(name)} (
    id CHAR(36) PRIMARY KEY, active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  if (!category.table_name) await pool.query("UPDATE api_categories SET table_name=? WHERE id=?", [name, category.id]);
  return name;
}

async function ensureLegacyColumn(table: string, column: ColumnRow) {
  const name = column.sql_name || `field_${column.id}_${ascii(column.name).slice(0, 45) || "alan"}`;
  const type = column.field_type === "relation" ? "CHAR(36) NULL" : sqlType(column.field_type);
  if (!await hasColumn(table, name)) await pool.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(name)} ${type}`);
  if (!column.sql_name) await pool.query("UPDATE api_category_columns SET sql_name=? WHERE id=?", [name, column.id]);
  return name;
}

async function migrateLegacyData() {
  const [categories] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories ORDER BY id");
  const tables = new Map<number, string>();
  for (const category of categories) tables.set(category.id, await ensureLegacyTable(category));
  const [columns] = await pool.query<ColumnRow[]>("SELECT * FROM api_category_columns ORDER BY category_id,position,id");
  for (const column of columns) {
    const table = tables.get(column.category_id);
    if (table) column.sql_name = await ensureLegacyColumn(table, column);
  }
  const [migrationRows] = await pool.query<any[]>("SELECT name FROM api_migration_state WHERE name='physical_categories_v1'");
  if (!migrationRows.length) for (const category of categories) {
    const table = tables.get(category.id)!;
    const fields = columns.filter(column => column.category_id === category.id);
    const [legacyRows] = await hasTable("api_category_rows")
      ? await pool.query<any[]>("SELECT id,data,active,updated_at FROM api_category_rows WHERE category_id=?", [category.id])
      : [[] as any[]];
    for (const legacy of legacyRows) {
      const data = typeof legacy.data === "string" ? JSON.parse(legacy.data) : legacy.data;
      const names = ["id", "active", "created_at", "updated_at", ...fields.map(field => field.sql_name!)];
      const values = [legacy.id || randomUUID(), legacy.active, legacy.updated_at, legacy.updated_at,
        ...fields.map(field => data[String(field.id)] ?? data[field.name] ?? null)];
      await pool.query(`INSERT IGNORE INTO ${identifier(table)} (${names.map(identifier).join(",")}) VALUES (${names.map(() => "?").join(",")})`, values);
    }
  }
  if (!migrationRows.length) await pool.query("INSERT INTO api_migration_state(name) VALUES ('physical_categories_v1')");
  for (const column of columns.filter(item => item.field_type === "relation" && item.reference_category_id)) {
    const source = tables.get(column.category_id), target = tables.get(column.reference_category_id!);
    if (source && target) await addForeignKey(source, column, target);
  }
}

async function migrateReadableTables() {
  const [done] = await pool.query<any[]>("SELECT 1 FROM api_migration_state WHERE name='readable_tables_v2'");
  if (done.length) return;
  const [categories] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories ORDER BY id");
  const [columns] = await pool.query<ColumnRow[]>("SELECT * FROM api_category_columns ORDER BY category_id,position,id");
  const targetNames = new Map<number, string>();
  const usedNames = new Set<string>();
  for (const category of categories) {
    const name = tableName(category.id, category.name);
    if (usedNames.has(name)) throw new Error(`Kategori tablo adı çakışıyor: ${name}`);
    usedNames.add(name);
    targetNames.set(category.id, name);
    const seenColumns = new Set<string>();
    for (const column of columns.filter(item => item.category_id === category.id)) {
      const field = columnName(column.id, column.name);
      if (["id", "legacy_id", "gtk_sort_order", "active", "created_at", "updated_at"].includes(field) || seenColumns.has(field)) {
        throw new Error(`SQL sütun adı çakışıyor: ${category.name}.${field}`);
      }
      seenColumns.add(field);
    }
  }
  for (const category of categories) {
    const target = targetNames.get(category.id)!;
    if (category.table_name === target) continue;
    const [existingTable] = await pool.query<any[]>(
      "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1", [target]);
    if (existingTable.length && !await hasColumn(target, "legacy_id")) throw new Error(`Tablo adı zaten kullanılıyor: ${target}`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ${identifier(target)} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, legacy_id CHAR(36) NULL UNIQUE,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const fields = columns.filter(item => item.category_id === category.id);
    for (const field of fields) {
      const name = columnName(field.id, field.name);
      if (!await hasColumn(target, name)) await pool.query(`ALTER TABLE ${identifier(target)} ADD COLUMN ${identifier(name)} ${sqlType(field.field_type)}`);
    }
    const oldTable = identifier(category.table_name!);
    const [oldRows] = await pool.query<any[]>(`SELECT * FROM ${oldTable} ORDER BY created_at,id`);
    for (const old of oldRows) {
      const ordinary = fields.filter(field => field.field_type !== "relation");
      const names = ["legacy_id", "active", "created_at", "updated_at", ...ordinary.map(field => columnName(field.id, field.name))];
      const values = [old.id, old.active, old.created_at, old.updated_at, ...ordinary.map(field => old[field.sql_name!])];
      await pool.query(`INSERT INTO ${identifier(target)} (${names.map(identifier).join(",")}) VALUES (${names.map(() => "?").join(",")}) ON DUPLICATE KEY UPDATE legacy_id=VALUES(legacy_id)`, values);
    }
  }
  // Resolve every old UUID only after all target tables contain their numeric IDs.
  for (const category of categories) {
    const target = targetNames.get(category.id)!;
    if (category.table_name === target) continue;
    const fields = columns.filter(item => item.category_id === category.id && item.field_type === "relation" && item.reference_category_id);
    for (const field of fields) {
      const referenced = targetNames.get(field.reference_category_id!);
      if (!referenced) throw new Error(`İlişki hedefi bulunamadı: ${field.name}`);
      await pool.query(`UPDATE ${identifier(target)} current_row
        JOIN ${identifier(category.table_name!)} old_row ON old_row.id=current_row.legacy_id
        LEFT JOIN ${identifier(referenced)} referenced_row ON referenced_row.legacy_id=old_row.${identifier(field.sql_name!)}
        SET current_row.${identifier(columnName(field.id, field.name))}=referenced_row.id`);
    }
    if (fields.length) await pool.query(`UPDATE ${identifier(target)} current_row
      JOIN ${identifier(category.table_name!)} old_row ON old_row.id=current_row.legacy_id
      SET current_row.updated_at=old_row.updated_at`);
  }
  for (const category of categories) {
    const target = targetNames.get(category.id)!;
    for (const field of columns.filter(item => item.category_id === category.id && item.field_type === "relation" && item.reference_category_id)) {
      await addForeignKey(target, { ...field, sql_name: columnName(field.id, field.name) }, targetNames.get(field.reference_category_id!)!);
    }
  }
  await withTransaction(async connection => {
    for (const category of categories) await connection.query("UPDATE api_categories SET table_name=? WHERE id=?", [targetNames.get(category.id), category.id]);
    for (const field of columns) await connection.query("UPDATE api_category_columns SET sql_name=? WHERE id=?", [columnName(field.id, field.name), field.id]);
    await connection.query("INSERT INTO api_migration_state(name) VALUES ('readable_tables_v2')");
  });
}

async function removeMigrationColumns() {
  const [categories] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories WHERE table_name IS NOT NULL");
  for (const category of categories) {
    const name = category.table_name;
    if (name && await hasColumn(name, "legacy_id")) {
      await pool.query(`ALTER TABLE ${identifier(name)} DROP COLUMN legacy_id`);
    }
  }
}

async function removeRowOrder() {
  const [categories] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories WHERE table_name IS NOT NULL");
  for (const category of categories) {
    const table = category.table_name!;
    if (await hasColumn(table, "gtk_sort_order")) await pool.query(`ALTER TABLE ${identifier(table)} DROP COLUMN gtk_sort_order`);
  }
  await pool.query("INSERT IGNORE INTO api_migration_state(name) VALUES ('row_order_removed_v4')");
}

async function removeRetiredTables() {
  const [states] = await pool.query<any[]>(
    "SELECT name FROM api_migration_state WHERE name IN ('physical_categories_v1','readable_tables_v2','retired_tables_removed_v1')",
  );
  const completed = new Set(states.map(row => row.name));
  // Keep the JSON source until it has passed through both category data migrations.
  if (!completed.has("physical_categories_v1") || !completed.has("readable_tables_v2") || completed.has("retired_tables_removed_v1")) return;

  for (const table of ["api_category_rows", "api_records", "api_media"]) {
    if (await hasTable(table)) await pool.query(`DROP TABLE ${identifier(table)}`);
  }
  await pool.query("INSERT IGNORE INTO api_migration_state(name) VALUES ('retired_tables_removed_v1')");
}

let initialization: Promise<void> | null = null;
export async function initDatabase() {
  if (!initialization) initialization = (async () => {
    await createMetadata();
    const [done] = await pool.query<any[]>("SELECT 1 FROM api_migration_state WHERE name='readable_tables_v2'");
    if (!done.length) { await migrateLegacyData(); await migrateReadableTables(); }
    await removeMigrationColumns();
    await removeRowOrder();
    await removeRetiredTables();
  })().catch(error => { initialization = null; throw error; });
  await initialization;
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
