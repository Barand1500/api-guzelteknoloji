import type { RowDataPacket } from "mysql2";
import { InputError } from "./categories.js";
import { withTransaction } from "./database.js";

export type QuotaScope = "minute" | "month";

export class QuotaError extends InputError {
  constructor(public scope: QuotaScope, public retryAfter: number) {
    super(scope === "minute" ? "Dakikalık istek kotası doldu" : "Aylık istek kotası doldu", 429);
  }
}

export function quotaLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 100_000_000) {
    throw new InputError("Kota 1 ile 100.000.000 arasında bir tam sayı olmalı");
  }
  return number;
}

/** The key row lock serializes all accepted requests for that key across server processes. */
export async function recordKeyUsage(keyId: string, target: { categoryId?: number; folderId?: number }, originHost: string) {
  await withTransaction(async connection => {
    const [keys] = await connection.query<RowDataPacket[]>(
      "SELECT minute_limit,month_limit,minute_reset_log_id,month_reset_log_id FROM api_keys WHERE id=? FOR UPDATE", [keyId],
    );
    if (!keys[0]) throw new InputError("API anahtarı bulunamadı", 401);
    const [counts] = await connection.query<RowDataPacket[]>(`SELECT
      SUM(id > ? AND created_at >= DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:00')) minuteUsed,
      SUM(id > ?) monthUsed,
      TIMESTAMPDIFF(SECOND,NOW(),DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 MINUTE),'%Y-%m-%d %H:%i:00')) minuteRetry,
      TIMESTAMPDIFF(SECOND,NOW(),DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 MONTH),'%Y-%m-01 00:00:00')) monthRetry
      FROM api_usage_logs WHERE api_key_id=? AND created_at >= DATE_FORMAT(NOW(),'%Y-%m-01 00:00:00')`, [keys[0].minute_reset_log_id, keys[0].month_reset_log_id, keyId]);
    const minuteLimit = keys[0].minute_limit === null ? null : Number(keys[0].minute_limit);
    const monthLimit = keys[0].month_limit === null ? null : Number(keys[0].month_limit);
    if (minuteLimit !== null && Number(counts[0].minuteUsed || 0) >= minuteLimit) throw new QuotaError("minute", Math.max(1, Number(counts[0].minuteRetry || 60)));
    if (monthLimit !== null && Number(counts[0].monthUsed || 0) >= monthLimit) throw new QuotaError("month", Math.max(1, Number(counts[0].monthRetry || 1)));
    await connection.query("INSERT INTO api_usage_logs(api_key_id,category_id,folder_id,origin_host) VALUES(?,?,?,?)", [
      keyId, target.categoryId ?? null, target.folderId ?? null, originHost.slice(0, 255),
    ]);
  });
}
