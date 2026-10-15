import { Layers } from "lucide-react";
import { loadCardTypes, saveCardTypes } from "./cardMetaStore";
import NamedMetaListPage from "./NamedMetaListPage";

export default function CardTypesListPage() {
  return (
    <NamedMetaListPage
      eyebrow="KART YÖNETİMİ"
      title="Kart Tipleri"
      subtitle="Kart tiplerini görüntüleyin ve yönetin"
      titleIcon={<Layers size={26} strokeWidth={2} />}
      addLabel="Yeni Kart Tipi"
      columnLabel="Kart Tipi"
      modalCreateTitle="Yeni Kart Tipi"
      modalEditTitle="Kart Tipi Düzenle"
      modalHint="Kart tipi adını girin."
      fieldLabel="Ad"
      load={loadCardTypes}
      save={saveCardTypes}
      idPrefix="ctype"
    />
  );
}
