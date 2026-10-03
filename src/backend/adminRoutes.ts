import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "./auth.js";
import { addColumn, categories, categoryById, createCategory, deleteCategory, deleteColumn, getSchema, InputError, publicData, saveSchema, updateCategory } from "./categories.js";
import { initDatabase, pool, withTransaction } from "./database.js";

export const adminRoutes = Router();
adminRoutes.use("/admin", requireAuth);
const panelPages = ["dashboard", "statistics", "playground", "schema-keys", "keys", "new", "settings", "appearance"] as const;
const sidebarPages = ["dashboard", "statistics", "playground", "schema-keys", "keys"] as const;
type PanelPage = typeof panelPages[number];
const defaultPanelPreferences = { sidebarOrder: [...sidebarPages], quickAccess: ["dashboard", "keys", null, null, null, null] as (PanelPage | null)[], searchWidth: 300 };

async function readPanelPreferences() {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT sidebar_order,quick_access,search_width FROM api_panel_preferences WHERE id=1");
  if (!rows[0]) return { ...defaultPanelPreferences, configured: false };
  const parseList = (value: unknown): unknown => typeof value === "string" ? JSON.parse(value) : value;
  const validPages = new Set<string>(panelPages);
  const storedOrder = parseList(rows[0].sidebar_order);
  const sidebarOrder = (Array.isArray(storedOrder) ? storedOrder : []).filter((page, index, list) => sidebarPages.includes(page) && list.indexOf(page) === index);
  for (const page of defaultPanelPreferences.sidebarOrder) if (!sidebarOrder.includes(page)) sidebarOrder.push(page);
  const storedQuickAccess = parseList(rows[0].quick_access);
  const quickAccess = (Array.isArray(storedQuickAccess) ? storedQuickAccess : []).slice(0, 6).map(page => page && validPages.has(page) ? page as PanelPage : null);
  while (quickAccess.length < 6) quickAccess.push(null);
  return { sidebarOrder, quickAccess, searchWidth: Math.max(180, Math.min(520, Number(rows[0].search_width) || 300)), configured: true };
}

function usageRange(request: Request) {
  const from = String(request.query.from || "").trim();
  const to = String(request.query.to || "").trim();
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(from) || !validDate(to) || from > to) throw new InputError("Geçerli bir tarih aralığı seçin");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > 90) throw new InputError("Tek seferde en fazla 90 günlük istatistik alınabilir");
  return { from, to };
}

adminRoutes.get("/admin/state", async (_request, response) => {
  await initDatabase();
  const [settings] = await pool.query<any[]>("SELECT value FROM api_settings WHERE id=1");
  response.json({ success: true, data: { enabled: settings[0]?.value !== "0", categories: await categories() } });
});
adminRoutes.patch("/admin/state", async (request, response) => {
  await initDatabase();
  if (typeof request.body?.enabled !== "boolean") throw new InputError("Servis durumu geçersiz");
  await pool.query("INSERT INTO api_settings(id,value) VALUES(1,?) ON DUPLICATE KEY UPDATE value=VALUES(value)", [request.body.enabled ? "1" : "0"]);
  const [settings] = await pool.query<any[]>("SELECT value FROM api_settings WHERE id=1");
  response.json({ success: true, data: { enabled: settings[0]?.value !== "0", categories: await categories() } });
});
adminRoutes.get("/admin/panel-preferences", async (_request, response) => response.json({ success: true, data: await readPanelPreferences() }));
adminRoutes.put("/admin/panel-preferences", async (request, response) => {
  const input = request.body || {};
  const uniquePages = [...new Set(Array.isArray(input.sidebarOrder) ? input.sidebarOrder : [])] as string[];
  if (uniquePages.some(page => !sidebarPages.includes(page as typeof sidebarPages[number]))) throw new InputError("Menü sıralaması geçersiz");
  for (const page of defaultPanelPreferences.sidebarOrder) if (!uniquePages.includes(page)) uniquePages.push(page);
  if (!Array.isArray(input.quickAccess) || input.quickAccess.length > 6 ||
      input.quickAccess.some((page: unknown) => page !== null && (typeof page !== "string" || !panelPages.includes(page as PanelPage)))) {
    throw new InputError("Hızlı erişim kutuları geçersiz");
  }
  const quickAccess = [...new Set(input.quickAccess)] as (PanelPage | null)[];
  while (quickAccess.length < 6) quickAccess.push(null);
  const searchWidth = Number(input.searchWidth);
  if (!Number.isInteger(searchWidth) || searchWidth < 180 || searchWidth > 520) throw new InputError("Arama alanı genişliği 180–520 piksel arasında olmalı");
  await pool.query(`INSERT INTO api_panel_preferences(id,sidebar_order,quick_access,search_width)
    VALUES(1,CAST(? AS JSON),CAST(? AS JSON),?)
    ON DUPLICATE KEY UPDATE sidebar_order=VALUES(sidebar_order),quick_access=VALUES(quick_access),search_width=VALUES(search_width)`,
  [JSON.stringify(uniquePages), JSON.stringify(quickAccess), searchWidth]);
  response.json({ success: true, data: await readPanelPreferences() });
});

adminRoutes.get("/admin/categories", async (_request, response) => response.json({ success: true, data: await categories() }));
adminRoutes.get("/admin/schema-overview", async (_request, response) => {
  await initDatabase();
  const categoryList = await categories();
  const [columns] = await pool.query<any[]>(`SELECT c.id categoryId,c.name categoryName,c.table_name tableName,
    col.id columnId,col.name columnName,col.sql_name sqlName,col.field_type fieldType,
    col.reference_category_id referenceCategoryId,target.name referenceCategoryName
    FROM api_categories c LEFT JOIN api_category_columns col ON col.category_id=c.id
    LEFT JOIN api_categories target ON target.id=col.reference_category_id
    ORDER BY c.name,col.position,col.id`);
  const byCategory = new Map(categoryList.map(category => [category.id, { ...category, columns: [] as any[] }]));
  for (const column of columns) if (column.columnId !== null) {
    byCategory.get(Number(column.categoryId))?.columns.push({
      id: Number(column.columnId), name: column.columnName, sqlName: column.sqlName,
      fieldType: column.fieldType, referenceCategoryId: column.referenceCategoryId ? Number(column.referenceCategoryId) : null,
      referenceCategoryName: column.referenceCategoryName,
    });
  }
  response.json({ success: true, data: [...byCategory.values()] });
});
adminRoutes.post("/admin/categories", async (request, response) => {
  const data = await createCategory(String(request.body?.name || ""), String(request.body?.slug || ""));
  response.status(201).json({ success: true, data });
});
adminRoutes.patch("/admin/categories/:id", async (request, response) => response.json({ success: true, data: await updateCategory(Number(request.params.id), request.body || {}) }));
adminRoutes.delete("/admin/categories/:id", async (request, response) => { await deleteCategory(Number(request.params.id)); response.json({ success: true }); });
adminRoutes.get("/admin/categories/:id/schema", async (request, response) => response.json({ success: true, data: await getSchema(Number(request.params.id)) }));
adminRoutes.put("/admin/categories/:id/schema", async (request, response) => response.json({ success: true, data: await saveSchema(Number(request.params.id), request.body || {}) }));
adminRoutes.post("/admin/categories/:id/columns", async (request, response) => response.status(201).json({ success: true, data: await addColumn(Number(request.params.id), request.body || {}) }));
adminRoutes.delete("/admin/categories/:categoryId/columns/:columnId", async (request, response) => { await deleteColumn(Number(request.params.categoryId), Number(request.params.columnId)); response.json({ success: true }); });

adminRoutes.get("/admin/api-keys", async (_request, response) => {
  await initDatabase();
  const [rows] = await pool.query<any[]>(`SELECT k.id,k.project_name projectName,k.api_key apiKey,k.active,k.created_at createdAt,
    COUNT(DISTINCT l.id) usageCount,COUNT(DISTINCT NULLIF(l.origin_host,'')) siteCount,
    GROUP_CONCAT(DISTINCT c.name SEPARATOR '||') categoryNames,GROUP_CONCAT(DISTINCT c.id) categoryIds
    FROM api_keys k LEFT JOIN api_key_categories kc ON kc.api_key_id=k.id
    LEFT JOIN api_categories c ON c.id=kc.category_id LEFT JOIN api_usage_logs l ON l.api_key_id=k.id
    GROUP BY k.id ORDER BY k.created_at DESC`);
  response.json({ success: true, data: rows.map(row => ({
    ...row, active: Boolean(row.active), usageCount: Number(row.usageCount), siteCount: Number(row.siteCount),
    categoryNames: row.categoryNames ? String(row.categoryNames).split("||") : [],
    categoryIds: row.categoryIds ? String(row.categoryIds).split(",").map(Number) : [],
  })) });
});

adminRoutes.get("/admin/usage/summary", async (request, response) => {
    await initDatabase();
    const { from, to } = usageRange(request);
    const range = "created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)";
    const [totals] = await pool.query<any[]>(`SELECT COUNT(*) total,COUNT(DISTINCT api_key_id) activeKeys,
      COUNT(DISTINCT NULLIF(origin_host,'')) sites,MAX(created_at) lastRequest
      FROM api_usage_logs WHERE ${range}`, [from, to]);
    const [daily] = await pool.query<any[]>(`SELECT DATE(created_at) day,COUNT(*) requests FROM api_usage_logs
      WHERE ${range} GROUP BY DATE(created_at) ORDER BY day`, [from, to]);
    const [byCategory] = await pool.query<any[]>(`SELECT c.id categoryId,COALESCE(c.name,'Silinmiş kategori') name,COUNT(*) requests
      FROM api_usage_logs l LEFT JOIN api_categories c ON c.id=l.category_id
      WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY c.id,c.name ORDER BY requests DESC LIMIT 10`, [from, to]);
    const [byProject] = await pool.query<any[]>(`SELECT k.id keyId,k.project_name projectName,COUNT(*) requests
      FROM api_usage_logs l JOIN api_keys k ON k.id=l.api_key_id
      WHERE l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY k.id,k.project_name ORDER BY requests DESC LIMIT 10`, [from, to]);
    response.json({ success: true, data: {
      from, to,
      totals: { requests: Number(totals[0]?.total || 0), activeKeys: Number(totals[0]?.activeKeys || 0), sites: Number(totals[0]?.sites || 0), lastRequest: totals[0]?.lastRequest || null },
      daily: daily.map(row => ({ day: row.day, requests: Number(row.requests) })),
      byCategory: byCategory.map(row => ({ categoryId: row.categoryId ? Number(row.categoryId) : null, name: row.name, requests: Number(row.requests) })),
      byProject: byProject.map(row => ({ keyId: row.keyId, projectName: row.projectName, requests: Number(row.requests) })),
    } });
  });

adminRoutes.get("/admin/usage/logs", async (request, response) => {
    await initDatabase();
    const { from, to } = usageRange(request);
    const page = Math.max(1, Math.min(1_000_000, Number(request.query.page) || 1));
    const pageSize = Math.max(10, Math.min(100, Number(request.query.pageSize) || 25));
    const q = String(request.query.q || "").trim().slice(0, 120);
    const categoryId = request.query.categoryId ? Number(request.query.categoryId) : 0;
    const conditions = ["l.created_at >= ?", "l.created_at < DATE_ADD(?, INTERVAL 1 DAY)"];
    const values: (string | number)[] = [from, to];
    if (categoryId) {
      if (!Number.isSafeInteger(categoryId)) throw new InputError("Kategori filtresi geçersiz");
      conditions.push("l.category_id=?");
      values.push(categoryId);
    }
    if (q) {
      conditions.push("(k.project_name LIKE ? OR c.name LIKE ? OR l.origin_host LIKE ?)");
      values.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const where = conditions.join(" AND ");
    const [counts] = await pool.query<any[]>(`SELECT COUNT(*) total FROM api_usage_logs l
      LEFT JOIN api_keys k ON k.id=l.api_key_id LEFT JOIN api_categories c ON c.id=l.category_id WHERE ${where}`, values);
    const [rows] = await pool.query<any[]>(`SELECT l.id,l.created_at createdAt,l.origin_host originHost,
      k.project_name projectName,c.name categoryName FROM api_usage_logs l
      LEFT JOIN api_keys k ON k.id=l.api_key_id LEFT JOIN api_categories c ON c.id=l.category_id
      WHERE ${where} ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize]);
    response.json({ success: true, data: { rows, page, pageSize, total: Number(counts[0]?.total || 0) } });
  });

adminRoutes.post("/admin/playground/:categoryId", async (request, response) => {
    await initDatabase();
    const categoryId = Number(request.params.categoryId);
    if (!Number.isSafeInteger(categoryId)) throw new InputError("Kategori geçersiz");
    const category = await categoryById(categoryId);
    if (!category.active) throw new InputError("Kategori API erişimi kapalı", 404);
    const [service] = await pool.query<any[]>("SELECT value FROM api_settings WHERE id=1");
    if (service[0]?.value === "0") throw new InputError("API şu anda kapalı", 503);
    const apiKey = String(request.body?.apiKey || "").trim();
    if (!apiKey || apiKey.length > 96) throw new InputError("Geçerli bir API anahtarı girin", 401);
    const [keys] = await pool.query<any[]>(`SELECT k.id FROM api_keys k
      JOIN api_key_categories kc ON kc.api_key_id=k.id
      WHERE k.api_key=? AND k.active=1 AND kc.category_id=? LIMIT 1`, [apiKey, categoryId]);
    if (!keys[0]) throw new InputError("Bu anahtar kategoriye erişemiyor veya geçersiz", 401);
    const started = performance.now();
    const data = await publicData(category);
    const durationMs = Math.round(performance.now() - started);
    await pool.query("INSERT INTO api_usage_logs(api_key_id,category_id,origin_host) VALUES(?,?,?)", [keys[0].id, categoryId, "admin-playground"]);
    response.json({ success: true, data: { status: 200, durationMs, endpoint: `/v1/${category.slug}`, response: { success: true, category: { id: category.id, name: category.name, slug: category.slug }, data } } });
  });

adminRoutes.get("/admin/api-keys/:id", async (request, response) => {
    await initDatabase();
    const [keys] = await pool.query<any[]>(`SELECT k.id,k.project_name projectName,k.active,k.created_at createdAt,
      RIGHT(k.api_key,4) keySuffix,COUNT(l.id) usageCount,MAX(l.created_at) lastUsedAt
      FROM api_keys k LEFT JOIN api_usage_logs l ON l.api_key_id=k.id
      WHERE k.id=? GROUP BY k.id LIMIT 1`, [request.params.id]);
    if (!keys[0]) throw new InputError("API anahtarı bulunamadı", 404);
    const [categoriesForKey] = await pool.query<any[]>(`SELECT c.id,c.name,c.slug,c.active FROM api_key_categories kc
      JOIN api_categories c ON c.id=kc.category_id WHERE kc.api_key_id=? ORDER BY c.name`, [request.params.id]);
    const [recent] = await pool.query<any[]>(`SELECT l.created_at createdAt,l.origin_host originHost,c.name categoryName
      FROM api_usage_logs l LEFT JOIN api_categories c ON c.id=l.category_id
      WHERE l.api_key_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT 20`, [request.params.id]);
    response.json({ success: true, data: { ...keys[0], active: Boolean(keys[0].active), usageCount: Number(keys[0].usageCount), categories: categoriesForKey.map(item => ({ ...item, active: Boolean(item.active) })), recent } });
  });

adminRoutes.post("/admin/api-keys/:id/rotate", async (request, response) => {
    await initDatabase();
    const apiKey = `gtk_${randomUUID().replace(/-/g, "")}`;
    const [result] = await pool.query<any>("UPDATE api_keys SET api_key=? WHERE id=?", [apiKey, request.params.id]);
    if (!result.affectedRows) throw new InputError("API anahtarı bulunamadı", 404);
    response.json({ success: true, data: { apiKey } });
  });
adminRoutes.post("/admin/api-keys", async (request, response) => {
  await initDatabase();
  const projectName = String(request.body?.projectName || "").trim();
  const categoryIds = Array.isArray(request.body?.categoryIds) ? [...new Set(request.body.categoryIds.map(Number))] as number[] : [];
  if (!projectName || !categoryIds.length || categoryIds.some(id => !Number.isSafeInteger(id))) throw new InputError("Proje adı ve en az bir kategori seçin");
  for (const id of categoryIds) await categoryById(id);
  const item = { id: randomUUID(), projectName, apiKey: `gtk_${randomUUID().replace(/-/g, "")}`, active: true };
  await withTransaction(async connection => {
    await connection.query("INSERT INTO api_keys(id,project_name,api_key,active) VALUES(?,?,?,1)", [item.id, item.projectName, item.apiKey]);
    for (const id of categoryIds) await connection.query("INSERT INTO api_key_categories(api_key_id,category_id) VALUES(?,?)", [item.id, id]);
  });
  response.status(201).json({ success: true, data: item });
});
adminRoutes.patch("/admin/api-keys/:id", async (request, response) => {
  if (typeof request.body?.active !== "boolean") throw new InputError("Anahtar durumu geçersiz");
  await pool.query("UPDATE api_keys SET active=? WHERE id=?", [request.body.active ? 1 : 0, request.params.id]);
  response.json({ success: true });
});
adminRoutes.delete("/admin/api-keys/:id", async (request, response) => { await pool.query("DELETE FROM api_keys WHERE id=?", [request.params.id]); response.json({ success: true }); });

adminRoutes.get("/admin/records", async (_request, response) => {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT id,category_id categoryId,name,value,active,updated_at updatedAt FROM api_records ORDER BY updated_at DESC");
  response.json({ success: true, data: rows.map(row => ({ ...row, active: Boolean(row.active) })) });
});
adminRoutes.post("/admin/records", async (request, response) => {
  await initDatabase();
  const name = String(request.body?.name || "").trim(), value = String(request.body?.value || "").trim();
  const categoryId = Number(request.body?.categoryId);
  if (!name || !value || !Number.isSafeInteger(categoryId)) throw new InputError("Ad, değer ve kategori gerekli");
  await categoryById(categoryId);
  const id = randomUUID();
  await pool.query("INSERT INTO api_records(id,category_id,name,value,active) VALUES(?,?,?,?,?)", [id, categoryId, name, value, request.body?.active === false ? 0 : 1]);
  response.status(201).json({ success: true, data: { id, categoryId, name, value, active: request.body?.active !== false } });
});
