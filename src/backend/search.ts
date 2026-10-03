import { Router } from "express";
import { requireAuth } from "./auth.js";
import { identifier, initDatabase, pool, type CategoryRow, type ColumnRow } from "./database.js";

export const searchRoutes = Router();

searchRoutes.get("/admin/search", requireAuth, async (request, response) => {
  await initDatabase();
  const query = String(request.query.q || "").trim().slice(0, 120);
  if (query.length < 2) return response.json({ success: true, data: [] });
  const pattern = `%${query}%`;
  const results: { id: string; kind: "category" | "column" | "row" | "key"; title: string; subtitle: string; categoryId?: number }[] = [];
  const [categories] = await pool.query<CategoryRow[]>("SELECT * FROM api_categories ORDER BY name");
  const [columns] = await pool.query<ColumnRow[]>("SELECT * FROM api_category_columns ORDER BY category_id,position,id");
  for (const category of categories) {
    const fields = columns.filter(field => field.category_id === category.id);
    if (`${category.name} ${category.slug} ${category.table_name}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))) {
      results.push({ id: `category-${category.id}`, kind: "category", title: category.name, subtitle: `Kategori · /api/categories/${category.slug}`, categoryId: category.id });
    }
    for (const field of fields) if (`${field.name} ${field.sql_name}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))) {
      results.push({ id: `column-${field.id}`, kind: "column", title: field.name, subtitle: `${category.name} · Sütun`, categoryId: category.id });
    }
    if (!category.table_name) continue;
    const expressions = ["CAST(id AS CHAR) LIKE ?", ...fields.map(field => `CAST(${identifier(field.sql_name!)} AS CHAR) LIKE ?`)];
    const [rows] = await pool.query<any[]>(`SELECT * FROM ${identifier(category.table_name)} WHERE ${expressions.join(" OR ")} ORDER BY gtk_sort_order,id LIMIT 12`, expressions.map(() => pattern));
    for (const row of rows) {
      const matchingField = fields.find(field => String(row[field.sql_name!] ?? "").toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
      const labelField = fields.find(field => field.field_type === "text") || matchingField;
      const title = String(labelField ? row[labelField.sql_name!] || `Kayıt #${row.id}` : `Kayıt #${row.id}`);
      results.push({ id: `row-${category.id}-${row.id}`, kind: "row", title, subtitle: `${category.name} · Kayıt #${row.id}${matchingField && matchingField !== labelField ? ` · ${matchingField.name}: ${String(row[matchingField.sql_name!]).slice(0, 48)}` : ""}`, categoryId: category.id });
    }
  }
  const [keys] = await pool.query<any[]>("SELECT id,project_name,api_key FROM api_keys WHERE project_name LIKE ? OR api_key LIKE ? ORDER BY created_at DESC LIMIT 20", [pattern, pattern]);
  for (const key of keys) results.push({ id: `key-${key.id}`, kind: "key", title: key.project_name, subtitle: "API anahtarı" });
  response.json({ success: true, data: results.slice(0, 100) });
});
