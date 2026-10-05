import { Router, type NextFunction, type Request, type Response } from "express";
import { apiKeyForCategory, categoryBySlug, InputError, publicData } from "./categories.js";
import { initDatabase, pool } from "./database.js";
import { folderBundle, recordFolderUsage } from "./folderBundles.js";
import { recordKeyUsage } from "./keyQuota.js";

export const publicRoutes = Router();
const publicBaseUrl = (request: Request) => String(process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`).replace(/\/$/, "");

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
    return response.json({ success: true, category: { id: category.id, name: category.name, slug: category.slug }, data: await publicData(category, publicBaseUrl(request)) });
  }
  const key = await apiKeyForCategory(apiKey, category.id);
  if (!key) throw new InputError("Bu API için geçerli bir X-API-Key gerekli", 401);
  const data = await publicData(category, publicBaseUrl(request));
  await recordKeyUsage(key.id, { categoryId: category.id }, String(request.headers.origin || request.headers.referer || request.headers.host || ""));
  response.json({ success: true, category: { id: category.id, name: category.name, slug: category.slug }, data });
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
async function serveFolder(request: Request, response: Response) {
  const folderId = Number(request.params.folderId);
  const apiKey = String(request.headers["x-api-key"] || request.query.apiKey || "").trim();
  const result = await folderBundle(folderId, apiKey, publicBaseUrl(request));
  await recordFolderUsage(result.keyId, folderId, String(request.headers.origin || request.headers.referer || request.headers.host || ""));
  response.json(result.response);
}
publicRoutes.get("/api/folders/:folderId", serviceEnabled, serveFolder);
publicRoutes.get("/v1/folders/:folderId", serviceEnabled, serveFolder);
