/**
 * AnyPay ↔ merkez köprüsü
 * Base: https://api.guzelteknoloji.com/v1/tahsilat
 * Header: X-API-Key
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { lookupBinByDigits } from "./binsBootstrap.js";
import { apiKeyForCategory, InputError } from "./categories.js";
import { initDatabase, pool } from "./database.js";
import { recordKeyUsage } from "./keyQuota.js";
import {
  ensureAllTahsilatCatalog,
  ensureTahsilatResource,
  isTahsilatResource,
  listTahsilatResource,
  TAHSILAT_RESOURCES,
  type TahsilatResource,
} from "./tahsilatCatalog.js";

export const tahsilatPublicRoutes = Router();

const publicBaseUrl = (request: Request) =>
  String(process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`).replace(
    /\/$/,
    "",
  );

async function serviceEnabled(_request: Request, response: Response, next: NextFunction) {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT value FROM api_settings WHERE id=1");
  if (rows[0]?.value === "0") {
    return response.status(503).json({ success: false, message: "API şu anda kapalı" });
  }
  next();
}

async function authorizeResource(request: Request, resource: TahsilatResource) {
  const category = await ensureTahsilatResource(resource);
  const apiKey = String(request.headers["x-api-key"] || request.query.apiKey || "").trim();
  const key = await apiKeyForCategory(apiKey, category.id);
  if (!key) throw new InputError("Bu Tahsilat API için geçerli bir X-API-Key gerekli", 401);
  return { category, keyId: String(key.id) };
}

async function track(request: Request, keyId: string, categoryId: number) {
  await recordKeyUsage(
    keyId,
    { categoryId },
    String(request.headers.origin || request.headers.referer || request.headers.host || ""),
  );
}

/** Katalog özeti — hangi yollar açık */
tahsilatPublicRoutes.get("/v1/tahsilat", serviceEnabled, async (request, response) => {
  await ensureAllTahsilatCatalog();
  response.json({
    success: true,
    service: "guzel-teknoloji-tahsilat",
    base: `${publicBaseUrl(request)}/v1/tahsilat`,
    resources: TAHSILAT_RESOURCES,
    auth: "X-API-Key",
    note: "AnyPay API Ayarları: remoteBaseUrl = .../v1/tahsilat",
  });
});

tahsilatPublicRoutes.get("/v1/tahsilat/health", serviceEnabled, async (_request, response) => {
  await ensureAllTahsilatCatalog();
  response.json({ success: true, enabled: true, resources: TAHSILAT_RESOURCES });
});

/** BIN lookup — :resource'tan önce */
tahsilatPublicRoutes.get(
  "/v1/tahsilat/bins/lookup",
  serviceEnabled,
  async (request, response) => {
    const { category, keyId } = await authorizeResource(request, "bins");
    const digits = String(request.query.bin || request.query.card || request.query.digits || "");
    const hit = await lookupBinByDigits(digits, publicBaseUrl(request));
    await track(request, keyId, category.id);
    response.json({
      success: true,
      resource: "bins",
      category: { id: category.id, name: category.name, slug: category.slug },
      data: hit,
    });
  },
);

tahsilatPublicRoutes.get(
  "/v1/tahsilat/:resource",
  serviceEnabled,
  async (request, response) => {
    const resource = String(request.params.resource || "").toLowerCase();
    if (!isTahsilatResource(resource)) {
      throw new InputError(
        `Bilinmeyen kaynak. Geçerli: ${TAHSILAT_RESOURCES.join(", ")}`,
        404,
      );
    }
    const { category, keyId } = await authorizeResource(request, resource);
    const result = await listTahsilatResource(resource, publicBaseUrl(request), {
      province: String(request.query.province || ""),
      il: String(request.query.il || ""),
      provinceId: String(request.query.provinceId || ""),
      ilId: String(request.query.ilId || ""),
    });
    await track(request, keyId, category.id);
    response.json({
      success: true,
      resource: result.resource,
      category: result.category,
      data: result.data,
    });
  },
);
