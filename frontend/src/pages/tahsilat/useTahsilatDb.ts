import { useCallback, useEffect, useState } from "react";
import {
  fetchTahsilatResource,
  replaceTahsilatResource,
  type TahsilatAdminRow,
  type TahsilatResource,
} from "./tahsilatApi";

/** Tahsilat sayfaları: MySQL üzerinden oku/yaz */
export function useTahsilatDb(token: string, resource: TahsilatResource) {
  const [rows, setRows] = useState<TahsilatAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTahsilatResource(token, resource);
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme başarısız");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, resource]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persist = useCallback(
    async (next: TahsilatAdminRow[]) => {
      setSaving(true);
      setError("");
      try {
        const data = await replaceTahsilatResource(
          token,
          resource,
          next.map((r) => ({
            id: /^[1-9]\d*$/.test(r.id) ? r.id : undefined,
            active: r.active !== false,
            data: r.data,
          })),
        );
        setRows(data.rows);
        return data.rows;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Kayıt başarısız";
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [token, resource],
  );

  return { rows, setRows, loading, saving, error, setError, reload, persist };
}

export function str(row: TahsilatAdminRow, key: string) {
  const v = row.data[key];
  return v == null ? "" : String(v);
}
