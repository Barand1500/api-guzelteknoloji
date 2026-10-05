import type { ApiKey } from "../../shared/types";

export function QuotaFields({ minuteLimit, monthLimit }: { minuteLimit?: number | null; monthLimit?: number | null }) {
  return <div className="keys-quota-fields">
    <label className="keys-field">Dakikalık sınır<input name="minuteLimit" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={9} autoComplete="off" defaultValue={minuteLimit ?? ""} onInput={event => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 9); }} placeholder="Sınırsız" /><small>Boş bırakırsanız sınır uygulanmaz.</small></label>
    <label className="keys-field">Aylık sınır<input name="monthLimit" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={9} autoComplete="off" defaultValue={monthLimit ?? ""} onInput={event => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 9); }} placeholder="Sınırsız" /><small>Her takvim ayının başında yenilenir.</small></label>
  </div>;
}

function quotaPart(used: number, limit: number | null, label: string) {
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const tone = limit === null ? "unlimited" : remaining === 0 ? "exhausted" : used / limit >= .8 ? "warning" : "normal";
  return <span className={`keys-quota-part ${tone}`} title={`${label}: ${used.toLocaleString("tr-TR")} kullanıldı${limit === null ? "" : `, ${limit.toLocaleString("tr-TR")} sınır`}`}><b>{label}</b><strong>{remaining === null ? "Sınırsız" : `${remaining.toLocaleString("tr-TR")} kaldı`}</strong></span>;
}

export function KeyQuota({ row }: { row: ApiKey }) {
  return <div className="keys-quota-cell">{quotaPart(row.minuteUsed, row.minuteLimit, "Dakika")}{quotaPart(row.monthUsed, row.monthLimit, "Ay")}</div>;
}
