import { Tag } from "lucide-react";
import { loadCardKinds, saveCardKinds } from "./cardMetaStore";
import NamedMetaListPage from "./NamedMetaListPage";

export default function CardKindsListPage() {
  return (
    <NamedMetaListPage
      eyebrow="KART YÖNETİMİ"
      title="Kart Türleri"
      subtitle="Kart türlerini görüntüleyin ve yönetin"
      titleIcon={<Tag size={26} strokeWidth={2} />}
      addLabel="Yeni Kart Türü"
      columnLabel="Kart Türü"
      modalCreateTitle="Yeni Kart Türü"
      modalEditTitle="Kart Türü Düzenle"
      modalHint="Kart türü adını girin."
      fieldLabel="Ad"
      load={loadCardKinds}
      save={saveCardKinds}
      idPrefix="ckind"
    />
  );
}
