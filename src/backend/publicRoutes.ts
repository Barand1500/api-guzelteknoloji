import { Router, type NextFunction, type Request, type Response } from "express";
import { categoryBySlug, InputError, publicData } from "./categories.js";
import { initDatabase, pool } from "./database.js";

export const publicRoutes = Router();

async function serviceEnabled(_request: Request, response: Response, next: NextFunction) {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT value FROM api_settings WHERE id=1");
  if (rows[0]?.value === "0") return response.status(503).json({ success: false, message: "API şu anda kapalı" });
  next();
}

async function serveCategory(request: Request, response: Response) {
  const requestedSlug = String(request.params.slug).toLowerCase();
  const aliases: Record<string, string[]> = {
    locations: ["locations", "lokasyonlar"],
    "tax-offices": ["tax-offices", "taxoffices", "vergi-daireleri", "vergidaireleri"],
    banks: ["banks", "bankalar"],
    bins: ["bins", "bin", "bin-kayitlari"],
  };
  let category;
  try { category = await categoryBySlug(requestedSlug); }
  catch (error) {
    if (!(error instanceof InputError) || !aliases[requestedSlug]) throw error;
    for (const alias of aliases[requestedSlug]) {
      try { category = await categoryBySlug(alias); break; } catch { /* Try next alias. */ }
    }
    if (!category) throw error;
  }
  const apiKey = String(request.headers["x-api-key"] || request.query.apiKey || "");
  const [counts] = await pool.query<any[]>("SELECT COUNT(*) AS total FROM api_keys");
  if (request.path.startsWith("/api/categories/") && Number(counts[0].total) === 0) {
    return response.json({ success: true, category: { id: category.id, name: category.name, slug: category.slug }, data: await publicData(category) });
  }
  const [keys] = await pool.query<any[]>(`SELECT k.id FROM api_keys k
    JOIN api_key_categories kc ON kc.api_key_id=k.id
    WHERE k.api_key=? AND k.active=1 AND kc.category_id=? LIMIT 1`, [apiKey, category.id]);
  if (!keys[0]) throw new InputError("Bu API için geçerli bir X-API-Key gerekli", 401);
  await pool.query("INSERT INTO api_usage_logs(api_key_id,category_id,origin_host) VALUES(?,?,?)", [
    keys[0].id, category.id, String(request.headers.origin || request.headers.referer || request.headers.host || "").slice(0, 255),
  ]);
  response.json({ success: true, category: { id: category.id, name: category.name, slug: category.slug }, data: await publicData(category) });
}

publicRoutes.get("/health", async (_request, response) => {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT value FROM api_settings WHERE id=1");
  response.json({ success: true, enabled: rows[0]?.value !== "0", service: "guzel-teknoloji-api" });
});
publicRoutes.get("/api/records", serviceEnabled, async (_request, response) => {
  const [rows] = await pool.query<any[]>("SELECT id,category_id categoryId,name,value,active,updated_at updatedAt FROM api_records WHERE active=1 ORDER BY updated_at DESC");
  response.json({ success: true, data: rows.map(row => ({ ...row, active: true })) });
});
publicRoutes.get("/api/categories/:slug", serviceEnabled, serveCategory);
publicRoutes.get("/v1/:slug", serviceEnabled, serveCategory);
