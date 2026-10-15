/**
 * Tahsilat ortak veri katalogları — kategori bootstrap + normalize.
 * AnyPay: GET /v1/tahsilat/{resource} + X-API-Key
 * Panel: /admin/tahsilat/{resource} → MySQL
 */
import { ensureBinsCategory } from "./binsBootstrap.js";
import {
  addColumn,
  createCategory,
  createCategoryFolder,
  InputError,
  normalizeSlug,
  publicData,
} from "./categories.js";
import { columnName, initDatabase, pool, tableName, type CategoryRow } from "./database.js";

export type TahsilatResource =
  | "bins"
  | "banks"
  | "provinces"
  | "districts"
  | "card-types"
  | "card-kinds"
  | "card-brands"
  | "virtual-pos"
  | "currencies"
  | "contracts"
  | "tax-offices"
  | "modules"
  | "template-vars"
  | "companies"
  | "email-settings"
  | "versions";

export const TAHSILAT_RESOURCES: TahsilatResource[] = [
  "bins",
  "banks",
  "provinces",
  "districts",
  "card-types",
  "card-kinds",
  "card-brands",
  "virtual-pos",
  "currencies",
  "contracts",
  "tax-offices",
  "modules",
  "template-vars",
  "versions",
];

/** Resources supported by the authenticated admin panel, including private records. */
const TAHSILAT_ADMIN_RESOURCES: TahsilatResource[] = [
  ...TAHSILAT_RESOURCES,
  "companies",
  "email-settings",
];

type ColDef = { name: string; fieldType: "text" | "integer" };

const RESOURCE_META: Record<Exclude<TahsilatResource, "bins">, { name: string; slug: string; columns: ColDef[] }> = {
  banks: {
    name: "Bankalar",
    slug: "banks",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "shortName", fieldType: "text" },
      { name: "logo", fieldType: "text" },
      { name: "gateway3dsUrl", fieldType: "text" },
      { name: "apiUrl", fieldType: "text" },
      { name: "xmlUrl", fieldType: "text" },
    ],
  },
  provinces: {
    name: "İller",
    slug: "provinces",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "plateCode", fieldType: "text" },
    ],
  },
  districts: {
    name: "İlçeler",
    slug: "districts",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "province", fieldType: "text" },
      { name: "provinceId", fieldType: "integer" },
    ],
  },
  "card-types": {
    name: "Kart Tipleri",
    slug: "card-types",
    columns: [{ name: "name", fieldType: "text" }],
  },
  "card-kinds": {
    name: "Kart Türleri",
    slug: "card-kinds",
    columns: [{ name: "name", fieldType: "text" }],
  },
  "card-brands": {
    name: "Kart Markaları",
    slug: "card-brands",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "logo", fieldType: "text" },
    ],
  },
  "virtual-pos": {
    name: "Ana Sanal Poslar",
    slug: "virtual-pos",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "bank", fieldType: "text" },
      { name: "variables", fieldType: "text" },
    ],
  },
  currencies: {
    name: "Para Birimleri",
    slug: "currencies",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "shortName", fieldType: "text" },
      { name: "symbol", fieldType: "text" },
    ],
  },
  contracts: {
    name: "Sözleşmeler",
    slug: "contracts",
    columns: [{ name: "name", fieldType: "text" }],
  },
  "tax-offices": {
    name: "Vergi Daireleri",
    slug: "tax-offices",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "code", fieldType: "text" },
      { name: "province", fieldType: "text" },
    ],
  },
  modules: {
    name: "Modüller",
    slug: "modules",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "code", fieldType: "text" },
      { name: "icon", fieldType: "text" },
      { name: "sortOrder", fieldType: "integer" },
      { name: "parentId", fieldType: "text" },
      { name: "parentName", fieldType: "text" },
    ],
  },
  "template-vars": {
    name: "Şablon Değişkenleri",
    slug: "template-vars",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "type", fieldType: "text" },
      { name: "variables", fieldType: "text" },
    ],
  },
  companies: {
    name: "Firmalar",
    slug: "companies",
    columns: [
      { name: "name", fieldType: "text" },
      { name: "domain", fieldType: "text" },
      { name: "domainActive", fieldType: "text" },
      { name: "dbHost", fieldType: "text" },
      { name: "dbPort", fieldType: "text" },
      { name: "dbName", fieldType: "text" },
      { name: "dbUser", fieldType: "text" },
      { name: "dbPassword", fieldType: "text" },
      { name: "dbActive", fieldType: "text" },
      { name: "frontendPath", fieldType: "text" },
      { name: "licenseEndsAt", fieldType: "text" },
      /** AnyPay X-API-Key — Firmalar ekranından kopyalanır */
      { name: "apiKey", fieldType: "text" },
      { name: "apiKeyId", fieldType: "text" },
    ],
  },
  "email-settings": {
    name: "E-Posta Ayarları",
    slug: "email-settings",
    columns: [
      { name: "host", fieldType: "text" },
      { name: "port", fieldType: "text" },
      { name: "address", fieldType: "text" },
      { name: "password", fieldType: "text" },
      { name: "ssl", fieldType: "text" },
      { name: "tls", fieldType: "text" },
    ],
  },
  versions: {
    name: "Sürümler",
    slug: "versions",
    columns: [
      { name: "version", fieldType: "text" },
      { name: "releasedAt", fieldType: "text" },
      { name: "added", fieldType: "text" },
      { name: "fixed", fieldType: "text" },
      { name: "removed", fieldType: "text" },
    ],
  },
};

export async function ensureTahsilatFolderId(): Promise<number | null> {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM api_category_folders WHERE name=? AND parent_id IS NULL LIMIT 1",
      ["Tahsilat"],
    );
    if (rows[0]?.id) return Number(rows[0].id);
    const folder = await createCategoryFolder("Tahsilat", null);
    return Number(folder.id);
  } catch {
    return null;
  }
}

function normKey(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function findBySlug(slug: string): Promise<CategoryRow | null> {
  const [rows] = await pool.query<CategoryRow[]>(
    "SELECT * FROM api_categories WHERE slug=? LIMIT 1",
    [slug],
  );
  return rows[0] ?? null;
}

async function findCategoryForMeta(meta: { name: string; slug: string }): Promise<CategoryRow | null> {
  const bySlug = await findBySlug(meta.slug);
  if (bySlug) return bySlug;
  const nameSlug = normalizeSlug(meta.name);
  if (nameSlug && nameSlug !== meta.slug) {
    const byNameSlug = await findBySlug(nameSlug);
    if (byNameSlug) return byNameSlug;
  }
  const [byName] = await pool.query<CategoryRow[]>(
    "SELECT * FROM api_categories WHERE name=? LIMIT 1",
    [meta.name],
  );
  return byName[0] ?? null;
}

/** Sütun yoksa ekle; kolon/metadata çakışması satır CRUD'yi bozmasın */
async function ensureColumns(categoryId: number, columns: ColDef[]) {
  const [existing] = await pool.query<any[]>(
    "SELECT name, sql_name FROM api_category_columns WHERE category_id=?",
    [categoryId],
  );
  const haveName = new Set(existing.map((r: { name: string }) => normKey(r.name)));
  const haveSql = new Set(
    existing
      .map((r: { name: string; sql_name: string | null }) => normKey(r.sql_name || r.name))
      .filter(Boolean),
  );

  for (const col of columns) {
    if (haveName.has(normKey(col.name))) continue;
    const sqlGuess = columnName(0, col.name);
    if (haveSql.has(normKey(sqlGuess))) {
      haveName.add(normKey(col.name));
      continue;
    }
    try {
      await addColumn(categoryId, col);
      haveName.add(normKey(col.name));
      haveSql.add(normKey(sqlGuess));
    } catch (err) {
      if (err instanceof InputError && err.status === 409) continue;
      const code = (err as { code?: string })?.code;
      if (code === "ER_DUP_ENTRY" || code === "ER_DUP_FIELDNAME") continue;
      throw err;
    }
  }
}

async function ensureNamedCategory(resource: Exclude<TahsilatResource, "bins">): Promise<CategoryRow> {
  await initDatabase();
  const meta = RESOURCE_META[resource];
  let category = await findCategoryForMeta(meta);
  if (!category) {
    const folderId = await ensureTahsilatFolderId();
    try {
      await createCategory(meta.name, meta.slug, folderId);
    } catch (err) {
      // "Bankalar" → tablo bankalar; slug banks ayrı olabilir — mevcut kategoriyi bağla
      category = await findCategoryForMeta(meta);
      if (!category) {
        const expectedTable = tableName(0, meta.name);
        const [byTable] = await pool.query<CategoryRow[]>(
          "SELECT * FROM api_categories WHERE table_name=? LIMIT 1",
          [expectedTable],
        );
        category = byTable[0] ?? null;
      }
      if (!category) throw err;
    }
    if (!category) category = await findCategoryForMeta(meta);
    if (!category) throw new InputError(`${meta.name} kategorisi oluşturulamadı`, 500);
  }

  // Slug standartlaştır (bankalar → banks vb.)
  if (category.slug !== meta.slug) {
    try {
      await pool.query("UPDATE api_categories SET slug=? WHERE id=?", [meta.slug, category.id]);
      category = { ...category, slug: meta.slug };
    } catch {
      /* slug unique — mevcut ile devam */
    }
  }
  if (!category.active) {
    await pool.query("UPDATE api_categories SET active=1 WHERE id=?", [category.id]);
  }

  await ensureColumns(category.id, meta.columns);
  const [fresh] = await pool.query<CategoryRow[]>(
    "SELECT * FROM api_categories WHERE id=? LIMIT 1",
    [category.id],
  );
  return fresh[0] || category;
}

export async function ensureTahsilatResource(resource: TahsilatResource): Promise<CategoryRow> {
  if (resource === "bins") return ensureBinsCategory();
  return ensureNamedCategory(resource);
}

export async function ensureAllTahsilatCatalog() {
  for (const resource of TAHSILAT_RESOURCES) {
    await ensureTahsilatResource(resource);
  }
}

export function isTahsilatResource(value: string): value is TahsilatResource {
  return (TAHSILAT_ADMIN_RESOURCES as string[]).includes(value);
}

export function isPublicTahsilatResource(value: string): value is TahsilatResource {
  return (TAHSILAT_RESOURCES as string[]).includes(value);
}

export async function listTahsilatResource(
  resource: TahsilatResource,
  baseUrl = "",
  query: Record<string, string | undefined> = {},
) {
  const category = await ensureTahsilatResource(resource);
  let data = await publicData(category, baseUrl);

  if (resource === "districts") {
    const province = String(query.province || query.il || "").trim();
    const provinceId = String(query.provinceId || query.ilId || "").trim();
    if (provinceId) {
      data = data.filter((row) => String((row as { provinceId?: unknown }).provinceId || "") === provinceId);
    } else if (province) {
      const key = province.toLocaleLowerCase("tr-TR");
      data = data.filter((row) =>
        String((row as { province?: unknown }).province || "")
          .toLocaleLowerCase("tr-TR")
          .includes(key),
      );
    }
  }

  return {
    category: { id: category.id, name: category.name, slug: category.slug },
    resource,
    data,
  };
}
