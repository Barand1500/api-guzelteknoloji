/**
 * Tahsilat ortak veri katalogları — kategori bootstrap + normalize.
 * AnyPay: GET /v1/tahsilat/{resource} + X-API-Key
 * Panel: /admin/tahsilat/{resource} → MySQL
 */
import { ensureBinsCategory } from "./binsBootstrap.js";
import {
  addColumn,
  categoryBySlug,
  createCategory,
  createCategoryFolder,
  InputError,
  publicData,
} from "./categories.js";
import { initDatabase, pool, type CategoryRow } from "./database.js";

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
  | "email-settings";

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
};

async function ensureTahsilatFolderId(): Promise<number | null> {
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
  try {
    return await categoryBySlug(slug);
  } catch {
    const [rows] = await pool.query<CategoryRow[]>(
      "SELECT * FROM api_categories WHERE slug=? LIMIT 1",
      [slug],
    );
    return rows[0] ?? null;
  }
}

async function ensureColumns(categoryId: number, columns: ColDef[]) {
  const [existing] = await pool.query<any[]>(
    "SELECT name FROM api_category_columns WHERE category_id=?",
    [categoryId],
  );
  const have = new Set(existing.map((r: { name: string }) => normKey(r.name)));
  for (const col of columns) {
    if (have.has(normKey(col.name))) continue;
    await addColumn(categoryId, col);
  }
}

async function ensureNamedCategory(resource: Exclude<TahsilatResource, "bins">): Promise<CategoryRow> {
  await initDatabase();
  const meta = RESOURCE_META[resource];
  let category = await findBySlug(meta.slug);
  if (!category) {
    const folderId = await ensureTahsilatFolderId();
    await createCategory(meta.name, meta.slug, folderId);
    category = await findBySlug(meta.slug);
    if (!category) throw new InputError(`${meta.name} kategorisi oluşturulamadı`, 500);
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
