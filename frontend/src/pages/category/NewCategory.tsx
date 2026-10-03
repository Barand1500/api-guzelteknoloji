import { useState, type FormEvent } from "react";
import { request } from "../../shared/api";
import { Field } from "../../shared/ui";

export default function NewCategory({ token, done }: { token: string; done: () => void }) {
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await request("/admin/categories", token, {
        method: "POST",
        body: JSON.stringify({ name: f.get("name"), slug: f.get("slug") }),
      });
      done();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">API üretim alanı</div>
          <h2>Yeni kategori oluştur</h2>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <Field
          label="Kategori adı"
          name="name"
          placeholder="Örn. Lokasyonlar"
        />
        <Field label="Endpoint adresi" name="slug" placeholder="lokasyonlar" />
        <div className="error">{error}</div>
        <div>
          <button className="btn">API kategorisini oluştur</button>
        </div>
      </form>
    </section>
  );
}
