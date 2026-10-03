import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL tanımlı değil");
export const pool = mysql.createPool(databaseUrl);

export interface CategoryRow extends RowDataPacket { id: number; name: string; slug: string; table_name: string | null; active: number; created_at: Date; updated_at: Date }
export interface ColumnRow extends RowDataPacket { id: number; category_id: number; name: string; sql_name: string | null; field_type: string; reference_category_id: number | null; position: number }

export function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new Error("Geçersiz SQL tanımlayıcısı");
  return `\`${value}\``;
}

const ascii = (value: string) => value.toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
  .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const tableName = (id: number, name: string) => `gtk_${id}_${ascii(name).slice(0, 45) || "kategori"}`;
export const columnName = (id: number, name: string) => `field_${id}_${ascii(name).slice(0, 45) || "alan"}`;

async function hasColumn(table: string, column: string) {
  const [rows] = await pool.query<any[]>(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function addMetadataColumn(table: string, column: string, definition: string) {
  if (!await hasColumn(table, column)) await pool.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`);
}

export function sqlType(fieldType: string): string {
  switch (fieldType) {
    case "number": return "DECIMAL(20,6) NULL";
    case "boolean": return "TINYINT(1) NULL";
    case "date": return "DATE NULL";
    case "relation": return "CHAR(36) NULL";
    default: return "LONGTEXT NULL";
  }
}

export async function ensurePhysicalTable(category: CategoryRow) {
  const name = category.table_name || tableName(category.id, category.name);
  identifier(name);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${identifier(name)} (
    id CHAR(36) PRIMARY KEY,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  if (!category.table_name) await pool.query("UPDATE api_categories SET table_name=? WHERE id=?", [name, category.id]);
  return name;
}

export async function ensurePhysicalColumn(table: string, column: ColumnRow) {
  const name = column.sql_name || columnName(column.id, column.name);
  if (!await hasColumn(table, name)) await pool.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(name)} ${sqlType(column.field_type)}`);
  if (!column.sql_name) await pool.query("UPDATE api_category_columns SET sql_name=? WHERE id=?", [name, column.id]);
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
  await pool.query(`CREATE TABLE IF NOT EXISTS api_category_rows (
    id CHAR(36) PRIMARY KEY, category_id INT NOT NULL, data JSON NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_api_row_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_records (
    id CHAR(36) PRIMARY KEY, category_id INT NOT NULL, name VARCHAR(180) NOT NULL,
    value LONGTEXT NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_api_record_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_keys (
    id CHAR(36) PRIMARY KEY, project_name VARCHAR(160) NOT NULL,
    api_key VARCHAR(96) NOT NULL UNIQUE, active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_key_categories (
    api_key_id CHAR(36) NOT NULL, category_id INT NOT NULL,
    PRIMARY KEY (api_key_id,category_id),
    CONSTRAINT fk_key_category_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    CONSTRAINT fk_key_category_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_usage_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, api_key_id CHAR(36) NOT NULL,
    category_id INT NULL, origin_host VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_usage_key (api_key_id), INDEX idx_usage_category (category_id),
    CONSTRAINT fk_usage_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    CONSTRAINT fk_usage_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_media (
    id CHAR(36) PRIMARY KEY, name VARCHAR(180) NOT NULL, url TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'image', active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_login_settings (
    id INT PRIMARY KEY, theme VARCHAR(12) NOT NULL DEFAULT 'light',
    quick_login_enabled TINYINT(1) NOT NULL DEFAULT 1, image_data LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query("CREATE TABLE IF NOT EXISTS api_settings (id INT PRIMARY KEY, value VARCHAR(16) NOT NULL)");
  await pool.query("CREATE TABLE IF NOT EXISTS api_migration_state (name VARCHAR(80) PRIMARY KEY, completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  await addMetadataColumn("api_categories", "table_name", "VARCHAR(64) NULL UNIQUE");
  await addMetadataColumn("api_categories", "updated_at", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  await addMetadataColumn("api_category_columns", "sql_name", "VARCHAR(64) NULL");
  await addMetadataColumn("api_category_columns", "reference_category_id", "INT NULL");
  await pool.query("UPDATE api_category_columns SET field_type='text' WHERE field_type NOT IN ('text','number','boolean','date','relation')");
}

async function migrateLegacyData() {
  const [categories] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories ORDER BY id");
  const tables = new Map<number, string>();
  for (const category of categories) tables.set(category.id, await ensurePhysicalTable(category));
  const [columns] = await pool.query<ColumnRow[]>("SELECT * FROM api_category_columns ORDER BY category_id,position,id");
  for (const column of columns) {
    const table = tables.get(column.category_id);
    if (table) column.sql_name = await ensurePhysicalColumn(table, column);
  }
  const [migrationRows] = await pool.query<any[]>("SELECT name FROM api_migration_state WHERE name='physical_categories_v1'");
  if (!migrationRows.length) for (const category of categories) {
    const table = tables.get(category.id)!;
    const fields = columns.filter(column => column.category_id === category.id);
    const [legacyRows] = await pool.query<any[]>("SELECT id,data,active,updated_at FROM api_category_rows WHERE category_id=?", [category.id]);
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

let initialization: Promise<void> | null = null;
export async function initDatabase() {
  if (!initialization) initialization = (async () => { await createMetadata(); await migrateLegacyData(); })().catch(error => { initialization = null; throw error; });
  await initialization;
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
