import { Construction } from "lucide-react";
import { tahsilatPageLabel, type TahsilatPageId } from "../../shared/tahsilatNav";

type Props = { page: TahsilatPageId };

/** Tahsilat sayfa iskeleti — içerik sonraki adımlarda doldurulur */
export default function TahsilatPlaceholder({ page }: Props) {
  const label = tahsilatPageLabel(page);
  return (
    <div className="tahsilat-placeholder">
      <div className="tahsilat-placeholder-card">
        <span className="tahsilat-placeholder-icon" aria-hidden>
          <Construction size={28} strokeWidth={1.8} />
        </span>
        <h1>{label}</h1>
        <p>
          Bu ekran Tahsilat menüsünde yer tutuyor. Ortak veriler ve yönetim burada
          toplanacak; AnyPay müşterileri API anahtarıyla buradan beslenecek.
        </p>
        <p className="tahsilat-placeholder-hint">İçerik sonraki adımda eklenecek.</p>
      </div>
    </div>
  );
}
