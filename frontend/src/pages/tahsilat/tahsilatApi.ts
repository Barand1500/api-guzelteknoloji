/** Tahsilat panel ↔ /admin/tahsilat/:resource (MySQL) */
import { request } from "../../shared/api";

export type TahsilatResource =
  | "bins"
  | "banks"
  | "provinces"
  | "districts"
  | "card-types"
  | "card-kinds"
  | "card-brands";

export type TahsilatAdminRow = {
  id: string;
  active: boolean;
  data: Record<string, string | number | boolean | null>;
};

export type TahsilatListPayload = {
  resource: TahsilatResource;
  category: { id: number; name: string; slug: string };
  columns: Array<{ id: number; name: string; fieldType: string }>;
  rows: TahsilatAdminRow[];
};

export async function fetchTahsilatResource(token: string, resource: TahsilatResource) {
  return request<TahsilatListPayload>(`/admin/tahsilat/${resource}`, token);
}

export async function replaceTahsilatResource(
  token: string,
  resource: TahsilatResource,
  rows: Array<{ id?: string; active?: boolean; data: Record<string, unknown> }>,
) {
  return request<TahsilatListPayload>(`/admin/tahsilat/${resource}`, token, {
    method: "PUT",
    body: JSON.stringify({ rows }),
  });
}

export function field(row: TahsilatAdminRow, key: string): string {
  const v = row.data[key];
  return v == null ? "" : String(v);
}
