/**
 * AnyPay uyumlu BIN kategorisi — yoksa oluşturur; lookup yardımcıları.
 * Sütun görünen adları: bank, bin, type, brand, kind
 */
import { addColumn, categoryBySlug, createCategory, createCategoryFolder, InputError, publicData } from "./categories.js";
import { identifier, initDatabase, pool, type CategoryRow } from "./database.js";

const BIN_SLUGS = ["bins", "bin", "bin-kayitlari"] as const;
const COLUMN_DEFS = [
  { name: "bank", fieldType: "text" as const },
  { name: "bin", fieldType: "text" as const },
  { name: "type", fieldType: "text" as const },
  { name: "brand", fieldType: "text" as const },
  { name: "kind", fieldType: "text" as const },
];

const SAMPLE_ROWS: Array<Record<string, string>> = [
  { bank: "Ziraat", bin: "979241", type: "Banka Kartı", brand: "TROY", kind: "Bireysel Kart" },
  { bank: "İş Bankası", bin: "450803", type: "Kredi Kartı", brand: "Visa", kind: "Bireysel Kart" },
  { bank: "Garanti", bin: "526955", type: "Kredi Kartı", brand: "MasterCard", kind: "Bireysel Kart" },
  { bank: "Garanti", bin: "540063", type: "Kredi Kartı", brand: "MasterCard", kind: "Ticari Kart" },
  { bank: "Yapı Kredi", bin: "454360", type: "Kredi Kartı", brand: "Visa", kind: "Bireysel Kart" },
  { bank: "Akbank", bin: "557113", type: "Kredi Kartı", brand: "MasterCard", kind: "Bireysel Kart" },
];

async function findBinsCategory(): Promise<CategoryRow | null> {
  for (const slug of BIN_SLUGS) {
    try {
      return await categoryBySlug(slug);
    } catch {
      /* sonraki */
    }
  }
  const [rows] = await pool.query<CategoryRow[]>(
    "SELECT * FROM api_categories WHERE slug IN ('bins','bin','bin-kayitlari') LIMIT 1",
  );
  return rows[0] ?? null;
}

async function ensureTahsilatFolderId(): Promise<number> {
  const [rows] = await pool.query<any[]>(
    "SELECT id FROM api_category_folders WHERE name=? AND parent_id IS NULL LIMIT 1",
    ["Tahsilat"],
  );
  if (rows[0]?.id) return Number(rows[0].id);
  try {
    const folder = await createCategoryFolder("Tahsilat", null);
    return Number(folder.id);
  } catch {
    const [existing] = await pool.query<any[]>(
      "SELECT id FROM api_category_folders WHERE name=? AND parent_id IS NULL LIMIT 1",
      ["Tahsilat"],
    );
    if (existing[0]?.id) return Number(existing[0].id);
    throw new InputError("Tahsilat klasörü oluşturulamadı", 500);
  }
}

async function ensureColumns(categoryId: number) {
  const [existing] = await pool.query<any[]>(
    "SELECT name FROM api_category_columns WHERE category_id=?",
    [categoryId],
  );
  const have = new Set(
    existing.map((r: { name: string }) =>
      r.name
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ""),
    ),
  );
  for (const col of COLUMN_DEFS) {
    const key = col.name;
    if (have.has(key)) continue;
    await addColumn(categoryId, col);
  }
}

async function ensureUniqueBinIndex(category: CategoryRow) {
  const table = category.table_name;
  if (!table) return;
  const [cols] = await pool.query<any[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='bin' LIMIT 1`,
    [table],
  );
  if (!cols.length) return;
  const [idx] = await pool.query<any[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME='uq_bin' LIMIT 1`,
    [table],
  );
  if (idx.length) return;
  try {
    await pool.query(`ALTER TABLE ${identifier(table)} ADD UNIQUE KEY uq_bin (bin(16))`);
  } catch {
    /* duplicate data — indeks yok say */
  }
}

async function seedSamplesIfEmpty(category: CategoryRow) {
  const table = category.table_name;
  if (!table) return;
  const [countRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS total FROM ${identifier(table)} WHERE active=1`,
  );
  if (Number(countRows[0]?.total || 0) > 0) return;

  const [cols] = await pool.query<any[]>(
    "SELECT name,sql_name FROM api_category_columns WHERE category_id=? ORDER BY position,id",
    [category.id],
  );
  const sqlByDisplay = new Map(
    cols.map((c: { name: string; sql_name: string | null }) => [
      c.name
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, ""),
      c.sql_name || c.name,
    ]),
  );
  const bankCol = sqlByDisplay.get("bank");
  const binCol = sqlByDisplay.get("bin");
  const typeCol = sqlByDisplay.get("type");
  const brandCol = sqlByDisplay.get("brand");
  const kindCol = sqlByDisplay.get("kind");
  if (!bankCol || !binCol) return;

  for (const sample of SAMPLE_ROWS) {
    const fields = [bankCol, binCol];
    const values: unknown[] = [sample.bank, sample.bin];
    if (typeCol) {
      fields.push(typeCol);
      values.push(sample.type);
    }
    if (brandCol) {
      fields.push(brandCol);
      values.push(sample.brand);
    }
    if (kindCol) {
      fields.push(kindCol);
      values.push(sample.kind);
    }
    const placeholders = fields.map(() => "?").join(",");
    const idents = fields.map((f) => identifier(f!)).join(",");
    try {
      await pool.query(
        `INSERT INTO ${identifier(table)} (${idents}, active) VALUES (${placeholders}, 1)`,
        values,
      );
    } catch {
      /* unique çakışması */
    }
  }
}

/** Kategori + sütunlar + örnek satırlar (bir kez / idempotent) */
export async function ensureBinsCategory(): Promise<CategoryRow> {
  await initDatabase();
  const folderId = await ensureTahsilatFolderId();
  let category = await findBinsCategory();
  const createdNow = !category;
  if (!category) {
    const created = await createCategory("BIN Kayıtları", "bins", folderId);
    category = await findBinsCategory();
    if (!category) throw new InputError(`BIN kategorisi oluşturulamadı (${created.slug})`, 500);
  }
  if (Number(category.folder_id) !== folderId) {
    await pool.query("UPDATE api_categories SET folder_id=? WHERE id=?", [folderId, category.id]);
  }
  await ensureColumns(category.id);
  // table_name / columns güncel olsun
  const [fresh] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories WHERE id=? LIMIT 1", [
    category.id,
  ]);
  category = fresh[0] || category;
  await ensureUniqueBinIndex(category);
  if (createdNow) await seedSamplesIfEmpty(category);
  return category;
}

export type BinLookupHit = {
  id: number;
  bank: string;
  bin: string;
  type: string;
  brand: string;
  kind: string;
};

function pickField(row: Record<string, unknown>, aliases: string[]): string {
  const keyFor = (value: string) =>
    value
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const found = Object.entries(row).find(([name]) => aliases.some((a) => keyFor(a) === keyFor(name)));
  return found?.[1] == null ? "" : String(found[1]).trim();
}

/** Kart önekine göre en uzun BIN eşleşmesi */
export async function lookupBinByDigits(
  cardDigits: string,
  baseUrl = "",
): Promise<BinLookupHit | null> {
  const d = String(cardDigits || "").replace(/\D/g, "");
  if (d.length < 4) return null;
  const category = await ensureBinsCategory();
  const rows = await publicData(category, baseUrl);
  let best: BinLookupHit | null = null;
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const bin = pickField(row, ["bin", "iin"]).replace(/\D/g, "").slice(0, 8);
    if (bin.length < 4) continue;
    if (!d.startsWith(bin)) continue;
    if (best && bin.length <= best.bin.length) continue;
    best = {
      id: Number(row.id) || 0,
      bank: pickField(row, ["bank", "banka"]),
      bin,
      type: pickField(row, ["type", "tip"]) || "",
      brand: pickField(row, ["brand", "marka"]) || "",
      kind: pickField(row, ["kind", "tur", "tür"]) || "",
    };
  }
  return best;
}
