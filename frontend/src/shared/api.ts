export async function request<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers }),
    json = await res.json();
  if (!res.ok) throw new Error(json.message || "İstek başarısız");
  return json.data ?? json;
}
