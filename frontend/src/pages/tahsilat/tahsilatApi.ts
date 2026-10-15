/** Tahsilat panel ↔ /admin/tahsilat/:resource (MySQL) */
import { request } from "../../shared/api";

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

export type TahsilatAdminRow = {
  id: string;
  active: boolean;
  data: Record<string, string | number | boolean | null>;
};

export type TahsilatListPayload = {
  resource: TahsilatResource;
  category: { id: number; name: string; slug: string; tableName?: string };
  columns: Array<{ id: number; name: string; fieldType: string }>;
  rows: TahsilatAdminRow[];
};

export async function fetchTahsilatResource(token: string, resource: TahsilatResource) {
  return request<TahsilatListPayload>(`/admin/tahsilat/${resource}`, token);
}

export async function createTahsilatRow(
  token: string,
  resource: TahsilatResource,
  row: { active?: boolean; data: Record<string, unknown> },
) {
  return request<TahsilatListPayload>(`/admin/tahsilat/${resource}`, token, {
    method: "POST",
    body: JSON.stringify(row),
  });
}

export async function updateTahsilatRow(
  token: string,
  resource: TahsilatResource,
  id: string,
  row: { active?: boolean; data: Record<string, unknown> },
) {
  return request<TahsilatListPayload>(`/admin/tahsilat/${resource}/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(row),
  });
}

export async function deleteTahsilatRow(token: string, resource: TahsilatResource, id: string) {
  return request<TahsilatListPayload>(`/admin/tahsilat/${resource}/${id}`, token, {
    method: "DELETE",
  });
}

export async function bulkUpsertTahsilat(
  token: string,
  resource: TahsilatResource,
  rows: Array<{ id?: string; active?: boolean; data: Record<string, unknown> }>,
) {
  return request<TahsilatListPayload>(`/admin/tahsilat/${resource}`, token, {
    method: "PUT",
    body: JSON.stringify({ rows }),
  });
}

/** Firma için gtk_ anahtarı üret / yenile — AnyPay X-API-Key */
export async function issueCompanyApiKey(token: string, companyId: string, rotate = true) {
  return request<{ apiKey: string; apiKeyId: string; rows: TahsilatAdminRow[] }>(
    `/admin/tahsilat/companies/${companyId}/api-key`,
    token,
    { method: "POST", body: JSON.stringify({ rotate }) },
  );
}

export function field(row: TahsilatAdminRow, key: string): string {
  const v = row.data[key];
  return v == null ? "" : String(v);
}
