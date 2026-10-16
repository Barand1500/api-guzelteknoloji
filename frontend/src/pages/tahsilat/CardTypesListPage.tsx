import { Layers } from "lucide-react";
import NamedMetaListPage from "./NamedMetaListPage";

type Props = { token: string };

export default function CardTypesListPage({ token }: Props) {
  return (
    <NamedMetaListPage
      token={token}
      resource="card-types"
      storageKey="tahsilat-card-types"
      exportFileName="kart-tipleri"
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
    />
  );
}
