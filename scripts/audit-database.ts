import "dotenv/config";
import mysql, { type RowDataPacket } from "mysql2/promise";

type TableNameRow = RowDataPacket & { tableName: string };
type NameRow = RowDataPacket & { name: string };
type CategoryRow = RowDataPacket & { id: number; name: string; table_name: string | null };
type TableReport = { table: string; rows: number; category: string; referencedBy: number };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL tanımlı değil; denetimi API sunucusundaki .env yapılandırmasıyla çalıştırın.");

const pool = mysql.createPool(databaseUrl);
const quoteIdentifier = (value: string) => `\`${value.replace(/`/g, "``")}\``;

async function audit() {
  const [tableRows] = await pool.query<TableNameRow[]>(
    "SELECT TABLE_NAME tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
  );
  const existing = new Set(tableRows.map(row => row.tableName));
  const [categories] = existing.has("api_categories")
    ? await pool.query<CategoryRow[]>("SELECT id,name,table_name FROM api_categories ORDER BY id")
    : [[] as CategoryRow[]];
  const [migrationRows] = existing.has("api_migration_state")
    ? await pool.query<NameRow[]>("SELECT name FROM api_migration_state")
    : [[] as NameRow[]];
  const migrations = new Set(migrationRows.map(row => row.name));
  const liveCategoryTables = new Set(categories.map(category => category.table_name).filter((name): name is string => Boolean(name)));
  const reports: TableReport[] = [];

  for (const { tableName } of tableRows) {
    const [[count]] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) rows FROM ${quoteIdentifier(tableName)}`);
    const [references] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) total FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME=?",
      [tableName],
    );
    const rows = Number(count.rows);
    const referencedBy = Number(references[0].total);
    let category = "Uygulama kullanımı kaynak koduyla ayrıca doğrulanmalı";
    if (liveCategoryTables.has(tableName)) category = "AKTİF kategori tablosu — silmeyin";
    else if (tableName === "api_category_columns") category = "AKTİF kategori şeması — silmeyin";
    else if (tableName === "api_category_rows") category = migrations.has("physical_categories_v1")
      ? "Eski JSON kayıt deposu — migrasyon/geri dönüş için korunuyor; satır sayısını kontrol edin"
      : "Gerekli migrasyon kaynağı — silmeyin";
    else if (tableName === "api_migration_state") category = "Migrasyon işaretleri — initDatabase bunları okur/yazar; silmeyin";
    else if (tableName.startsWith("gtk_") && /^gtk_[0-9]+_/.test(tableName)) {
      category = migrations.has("readable_tables_v2") && !liveCategoryTables.has(tableName)
        ? "Eski fiziksel kategori tablosu olabilir — canlı tabloyla veri karşılaştırması ve yedek onayı gerekir"
        : "Kategori migrasyonunda kullanılabilir — silmeyin";
    } else if (["api_categories", "api_keys", "api_key_categories", "api_usage_logs", "api_settings", "api_login_settings", "api_smtp_settings", "api_panel_preferences", "api_records"].includes(tableName)) {
      category = "Aktif uygulama tablosu — silmeyin";
    }
    reports.push({ table: tableName, rows, category, referencedBy });
  }

  console.log("READ-ONLY VERİTABANI DENETİMİ — hiçbir tablo değiştirilmedi veya silinmedi.");
  console.log(`Migrasyon işaretleri: ${migrations.size ? [...migrations].join(", ") : "bulunamadı"}`);
  console.log(`Aktif kategori tabloları: ${liveCategoryTables.size ? [...liveCategoryTables].join(", ") : "bulunamadı"}`);
  console.table(reports);
  console.log("Önemli: 'Eski fiziksel kategori tablosu olabilir' silme onayı değildir. Önce aynı kategori tablosuyla satır/veri karşılaştırması ve yedek doğrulaması gerekir.");
}

audit().catch(error => {
  console.error("Veritabanı denetimi başarısız:", error);
  process.exitCode = 1;
}).finally(() => pool.end());
