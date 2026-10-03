import { useCallback, useEffect, useState } from "react";
import { request } from "../../shared/api";
import type { Media } from "../../shared/types";

export default function Media({ token }: { token: string }) {
  const [rows, setRows] = useState<Media[]>([]);
  const load = useCallback(
    () => request<Media[]>("/admin/media", token).then(setRows),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Dosya galerisi</div>
          <h2>Yüklenen medyalar</h2>
        </div>
        <button
          className="btn"
          onClick={async () => {
            const name = prompt("Dosya adı"),
              url = name && prompt("Dosya URL adresi");
            if (name && url) {
              await request("/admin/media", token, {
                method: "POST",
                body: JSON.stringify({ name, url, mimeType: "image" }),
              });
              load();
            }
          }}
        >
          Medya ekle
        </button>
      </div>
      <div className="media-grid">
        {rows.map((x) => (
          <article className="card media" key={x.id}>
            <img src={x.url} alt="" />
            <div className="media-body">
              <b>{x.name}</b>
              <p className="muted">{x.mimeType}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
