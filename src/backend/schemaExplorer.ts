import { pool } from "./database.js";
import type { RowDataPacket } from "mysql2";

interface TableRow extends RowDataPacket { tableName: string; tableType: string; engine: string | null; estimatedRows: number | null; dataBytes: number | null; indexBytes: number | null }
interface ColumnRow extends RowDataPacket { tableName: string; name: string; sqlType: string; nullable: "YES" | "NO"; defaultValue: string | null; extra: string; columnKey: string; ordinalPosition: number }
interface ForeignKeyRow extends RowDataPacket { tableName: string; columnName: string; targetTable: string; targetColumn: string; constraintName: string }
interface CategoryRow extends RowDataPacket { tableName: string; categoryName: string; categoryId: number }
interface DatabaseRow extends RowDataPacket { databaseName: string }

export async function databaseSchema() {
  const [[databaseRows], [tables], [columns], [foreignKeys], [categories]] = await Promise.all([
    pool.query<DatabaseRow[]>("SELECT DATABASE() databaseName"),
    pool.query<TableRow[]>(`SELECT TABLE_NAME tableName,TABLE_TYPE tableType,ENGINE engine,
      TABLE_ROWS estimatedRows,DATA_LENGTH dataBytes,INDEX_LENGTH indexBytes
      FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME`),
    pool.query<ColumnRow[]>(`SELECT TABLE_NAME tableName,COLUMN_NAME name,COLUMN_TYPE sqlType,
      IS_NULLABLE nullable,COLUMN_DEFAULT defaultValue,EXTRA extra,COLUMN_KEY columnKey,
      ORDINAL_POSITION ordinalPosition FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION`),
    pool.query<ForeignKeyRow[]>(`SELECT TABLE_NAME tableName,COLUMN_NAME columnName,
      REFERENCED_TABLE_NAME targetTable,REFERENCED_COLUMN_NAME targetColumn,
      CONSTRAINT_NAME constraintName FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME,ORDINAL_POSITION`),
    pool.query<CategoryRow[]>("SELECT table_name tableName,name categoryName,id categoryId FROM api_categories"),
  ]);

  const categoryByTable = new Map(categories.map(category => [category.tableName, category]));
  const foreignKeysByColumn = new Map(foreignKeys.map(key => [`${key.tableName}\0${key.columnName}`, key]));
  const columnsByTable = new Map<string, typeof columns>();
  for (const column of columns) {
    const list = columnsByTable.get(column.tableName) || [];
    list.push(column);
    columnsByTable.set(column.tableName, list);
  }

  return {
    databaseName: databaseRows[0]?.databaseName || "",
    tables: tables.map(table => ({
      name: table.tableName,
      kind: table.tableType,
      engine: table.engine,
      estimatedRows: table.estimatedRows === null ? null : Number(table.estimatedRows),
      dataBytes: table.dataBytes === null ? null : Number(table.dataBytes),
      indexBytes: table.indexBytes === null ? null : Number(table.indexBytes),
      category: categoryByTable.get(table.tableName) ? {
        id: Number(categoryByTable.get(table.tableName)!.categoryId),
        name: categoryByTable.get(table.tableName)!.categoryName,
      } : null,
      columns: (columnsByTable.get(table.tableName) || []).map(column => {
        const foreignKey = foreignKeysByColumn.get(`${table.tableName}\0${column.name}`);
        return {
          name: column.name,
          sqlType: column.sqlType,
          nullable: column.nullable === "YES",
          defaultValue: column.defaultValue,
          extra: column.extra,
          key: column.columnKey,
          position: Number(column.ordinalPosition),
          reference: foreignKey ? {
            table: foreignKey.targetTable,
            column: foreignKey.targetColumn,
            constraint: foreignKey.constraintName,
          } : null,
        };
      }),
    })),
  };
}
