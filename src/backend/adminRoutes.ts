import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "./auth.js";
import { addColumn, categories, categoryById, createCategory, deleteCategory, deleteColumn, getSchema, InputError, saveSchema, updateCategory } from "./categories.js";
import { initDatabase, pool, withTransaction } from "./database.js";

export const adminRoutes = Router();
adminRoutes.use("/admin", requireAuth);

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

adminRoutes.get("/admin/categories", async (_request, response) => response.json({ success: true, data: await categories() }));
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

adminRoutes.get("/admin/media", async (_request, response) => {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT id,name,url,mime_type mimeType,active FROM api_media ORDER BY created_at DESC");
  response.json({ success: true, data: rows.map(row => ({ ...row, active: Boolean(row.active) })) });
});
adminRoutes.post("/admin/media", async (request, response) => {
  await initDatabase();
  const name = String(request.body?.name || "").trim(), url = String(request.body?.url || "").trim();
  if (!name || !url) throw new InputError("Dosya adı ve URL gerekli");
  const id = randomUUID();
  await pool.query("INSERT INTO api_media(id,name,url,mime_type,active) VALUES(?,?,?,?,1)", [id, name, url, String(request.body?.mimeType || "image")]);
  response.status(201).json({ success: true, data: { id } });
});
adminRoutes.delete("/admin/media/:id", async (request, response) => { await pool.query("DELETE FROM api_media WHERE id=?", [request.params.id]); response.json({ success: true }); });

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
