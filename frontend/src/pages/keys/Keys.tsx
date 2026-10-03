import { useCallback, useEffect, useState, type FormEvent } from "react";
import { request } from "../../shared/api";
import { Field } from "../../shared/ui";
import type { ApiKey, Category } from "../../shared/types";

export default function Keys({ token }: { token: string }) {
  const [rows, setRows] = useState<ApiKey[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [creating, setCreating] = useState(false);
  const load = useCallback(
    () =>
      Promise.all([
        request<ApiKey[]>("/admin/api-keys", token),
        request<Category[]>("/admin/categories", token),
      ]).then(([k, c]) => {
        setRows(k);
        setCategories(c);
      }),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      categoryIds = f.getAll("categoryIds").map(Number);
    await request("/admin/api-keys", token, {
      method: "POST",
      body: JSON.stringify({ projectName: f.get("projectName"), categoryIds }),
    });
    setCreating(false);
    load();
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Proje erişimleri</div>
          <h2>API anahtarları</h2>
        </div>
        <button className="btn" onClick={() => setCreating((v) => !v)}>
          ＋ Yeni anahtar
        </button>
      </div>
      {creating && (
        <form className="key-create" onSubmit={create}>
          <Field
            label="Proje / site adı"
            name="projectName"
            placeholder="Örn. Anypay Tahsilat"
          />
          <div>
            <label className="field-title">Kullanabileceği API’ler</label>
            <div className="check-grid">
              {categories.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" name="categoryIds" value={c.id} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn">Anahtar oluştur</button>
        </form>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Proje</th>
              <th>İzin verilen API’ler</th>
              <th>API Key</th>
              <th>Site</th>
              <th>İstek</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <b>{x.projectName}</b>
                </td>
                <td>
                  <div className="tag-list">
                    {x.categoryNames.map((n) => (
                      <span key={n}>{n}</span>
                    ))}
                  </div>
                </td>
                <td className="key">
                  <span>{x.apiKey}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(x.apiKey)}
                  >
                    Kopyala
                  </button>
                </td>
                <td>{x.siteCount}</td>
                <td>{x.usageCount}</td>
                <td>
                  <button
                    className={"switch compact " + (x.active ? "on" : "")}
                    onClick={async () => {
                      await request(`/admin/api-keys/${x.id}`, token, {
                        method: "PATCH",
                        body: JSON.stringify({ active: !x.active }),
                      });
                      load();
                    }}
                  >
                    {x.active ? "Açık" : "Kapalı"}
                  </button>
                </td>
                <td>
                  <button
                    className="text-danger"
                    onClick={async () => {
                      if (confirm("Anahtar silinsin mi?")) {
                        await request(`/admin/api-keys/${x.id}`, token, {
                          method: "DELETE",
                        });
                        load();
                      }
                    }}
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
