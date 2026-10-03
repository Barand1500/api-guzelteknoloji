import mysql from 'mysql2/promise';

export type Category = { id: number; name: string; slug: string; active: boolean; createdAt: string };
export type RecordItem = { id: string; categoryId: number; categoryName?: string; name: string; value: string; active: boolean; updatedAt: string };

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL tanımlı değil');
export const pool = mysql.createPool(url);

export async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS api_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL UNIQUE, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_records (id CHAR(36) PRIMARY KEY, category_id INT NOT NULL, name VARCHAR(180) NOT NULL, value LONGTEXT NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT fk_api_record_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_category_columns (id INT AUTO_INCREMENT PRIMARY KEY, category_id INT NOT NULL, name VARCHAR(120) NOT NULL, field_type VARCHAR(24) NOT NULL DEFAULT 'text', position INT NOT NULL DEFAULT 0, UNIQUE KEY uq_category_column (category_id,name), CONSTRAINT fk_api_column_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_category_rows (id CHAR(36) PRIMARY KEY, category_id INT NOT NULL, data JSON NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT fk_api_row_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_keys (id CHAR(36) PRIMARY KEY, project_name VARCHAR(160) NOT NULL, api_key VARCHAR(96) NOT NULL UNIQUE, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_key_categories (api_key_id CHAR(36) NOT NULL, category_id INT NOT NULL, PRIMARY KEY (api_key_id,category_id), CONSTRAINT fk_key_category_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE, CONSTRAINT fk_key_category_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE CASCADE)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_usage_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, api_key_id CHAR(36) NOT NULL, category_id INT NULL, origin_host VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_usage_key (api_key_id), INDEX idx_usage_category (category_id), CONSTRAINT fk_usage_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE, CONSTRAINT fk_usage_category FOREIGN KEY (category_id) REFERENCES api_categories(id) ON DELETE SET NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_media (id CHAR(36) PRIMARY KEY, name VARCHAR(180) NOT NULL, url TEXT NOT NULL, mime_type VARCHAR(100) NOT NULL DEFAULT 'image', active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_login_settings (id INT PRIMARY KEY, theme VARCHAR(12) NOT NULL DEFAULT 'light', quick_login_enabled TINYINT(1) NOT NULL DEFAULT 1, image_data LONGTEXT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
}

export async function listCategories(): Promise<Category[]> {
  const [rows] = await pool.query<any[]>(`SELECT id,name,slug,active,created_at FROM api_categories ORDER BY name`);
  return rows.map((r) => ({ id: Number(r.id), name: r.name, slug: r.slug, active: Boolean(r.active), createdAt: new Date(r.created_at).toISOString() }));
}
export async function listRecords(publicOnly = false): Promise<RecordItem[]> {
  const [rows] = await pool.query<any[]>(`SELECT r.id,r.category_id,r.name,r.value,r.active,r.updated_at,c.name category_name FROM api_records r JOIN api_categories c ON c.id=r.category_id ${publicOnly ? 'WHERE r.active=1 AND c.active=1' : ''} ORDER BY r.updated_at DESC`);
  return rows.map((r) => ({ id: r.id, categoryId: Number(r.category_id), categoryName: r.category_name, name: r.name, value: r.value, active: Boolean(r.active), updatedAt: new Date(r.updated_at).toISOString() }));
}
