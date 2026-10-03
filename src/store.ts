import { randomUUID } from 'node:crypto';
import { initDb, listCategories, listRecords, pool, type Category, type RecordItem } from './db.js';
export type { RecordItem } from './db.js';

export type Store = { enabled: boolean; categories: Category[]; records: RecordItem[] };
export type LoginSettings = { theme: 'light' | 'dark'; quickLoginEnabled: boolean; imageUrl: string };
let ready: Promise<void> | null = null;
async function ensure() { if (!ready) ready = initDb(); await ready; }

const DEFAULT_LOGIN_SETTINGS: LoginSettings = {
  theme: 'light',
  quickLoginEnabled: true,
  imageUrl: '/login-character.jpg',
};

export async function readLoginSettings(): Promise<LoginSettings> {
  await ensure();
  const [rows] = await pool.query<any[]>(`SELECT theme,quick_login_enabled,image_data FROM api_login_settings WHERE id=1`);
  const row = rows[0];
  if (!row) return DEFAULT_LOGIN_SETTINGS;
  return {
    theme: row.theme === 'dark' ? 'dark' : 'light',
    quickLoginEnabled: Boolean(row.quick_login_enabled),
    imageUrl: row.image_data || '/login-character.jpg',
  };
}

export async function writeLoginSettings(input: LoginSettings): Promise<LoginSettings> {
  await ensure();
  const imageData = input.imageUrl.startsWith('data:image/') ? input.imageUrl : null;
  await pool.query(
    `INSERT INTO api_login_settings (id,theme,quick_login_enabled,image_data) VALUES (1,?,?,?) ON DUPLICATE KEY UPDATE theme=VALUES(theme),quick_login_enabled=VALUES(quick_login_enabled),image_data=VALUES(image_data)`,
    [input.theme, input.quickLoginEnabled ? 1 : 0, imageData],
  );
  return readLoginSettings();
}

export async function readStore(): Promise<Store> {
  await ensure();
  await pool.query(`CREATE TABLE IF NOT EXISTS api_settings (id INT PRIMARY KEY, value VARCHAR(16) NOT NULL)`);
  const [rows] = await pool.query<any[]>(`SELECT value FROM api_settings WHERE id=1`);
  return { enabled: rows[0]?.value !== '0', categories: await listCategories(), records: await listRecords() };
}
export async function writeStore(store: Store) {
  await ensure();
  const [cats] = await pool.query<any[]>(`SELECT id FROM api_categories ORDER BY id LIMIT 1`);
  let categoryId = cats[0]?.id as number | undefined;
  if (!categoryId) {
    const [result] = await pool.query<any>(`INSERT INTO api_categories (name,slug) VALUES ('Genel','genel')`);
    categoryId = Number(result.insertId);
  }
  await pool.query(`INSERT INTO api_settings (id,value) VALUES (1,?) ON DUPLICATE KEY UPDATE value=VALUES(value)`, [store.enabled ? '1' : '0']);
  await pool.query(`DELETE FROM api_records`);
  for (const item of store.records) {
    await pool.query(`INSERT INTO api_records (id,category_id,name,value,active) VALUES (?,?,?,?,?)`, [item.id, categoryId, item.name, item.value, item.active ? 1 : 0]);
  }
}
export async function addRecord(categoryId: number, name: string, value: string, active = true) {
  await ensure(); const id = randomUUID();
  await pool.query(`INSERT INTO api_records (id,category_id,name,value,active) VALUES (?,?,?,?,?)`, [id, categoryId, name, value, active ? 1 : 0]);
  return (await listRecords()).find((x) => x.id === id)!;
}
