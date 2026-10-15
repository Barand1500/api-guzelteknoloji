import { useCallback, useEffect, useState } from "react";
import {
  bulkUpsertTahsilat,
  createTahsilatRow,
  deleteTahsilatRow,
  fetchTahsilatResource,
  updateTahsilatRow,
  type TahsilatAdminRow,
  type TahsilatResource,
} from "./tahsilatApi";

/** Tahsilat sayfaları: MySQL — tekil ekle/güncelle/sil (kalıcı) */
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
      setRows(data.rows || []);
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

  const saveRow = useCallback(
    async (row: TahsilatAdminRow) => {
      setSaving(true);
      setError("");
      try {
        const payload = { active: row.active !== false, data: row.data };
        const isDbId = /^[1-9]\d*$/.test(row.id);
        const data = isDbId
          ? await updateTahsilatRow(token, resource, row.id, payload)
          : await createTahsilatRow(token, resource, payload);
        setRows(data.rows || []);
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

  const removeRow = useCallback(
    async (id: string) => {
      setSaving(true);
      setError("");
      try {
        if (!/^[1-9]\d*$/.test(id)) {
          setRows((prev) => prev.filter((r) => r.id !== id));
          return;
        }
        const data = await deleteTahsilatRow(token, resource, id);
        setRows(data.rows || []);
        return data.rows;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Silme başarısız";
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [token, resource],
  );

  /** Toplu ekleme — mevcut satırları silmez */
  const persistBulk = useCallback(
    async (next: TahsilatAdminRow[]) => {
      setSaving(true);
      setError("");
      try {
        const data = await bulkUpsertTahsilat(
          token,
          resource,
          next.map((r) => ({
            id: /^[1-9]\d*$/.test(r.id) ? r.id : undefined,
            active: r.active !== false,
            data: r.data,
          })),
        );
        setRows(data.rows || []);
        return data.rows;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Toplu kayıt başarısız";
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [token, resource],
  );

  return {
    rows,
    setRows,
    loading,
    saving,
    error,
    setError,
    reload,
    saveRow,
    removeRow,
    persistBulk,
    /** @deprecated use saveRow / removeRow */
    persist: persistBulk,
  };
}

export function str(row: TahsilatAdminRow, key: string) {
  const v = row.data[key];
  return v == null ? "" : String(v);
}
