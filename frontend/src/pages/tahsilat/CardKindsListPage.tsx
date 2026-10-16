import { Tag } from "lucide-react";
import NamedMetaListPage from "./NamedMetaListPage";

type Props = { token: string };

export default function CardKindsListPage({ token }: Props) {
  return (
    <NamedMetaListPage
      token={token}
      resource="card-kinds"
      storageKey="tahsilat-card-kinds"
      exportFileName="kart-turleri"
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
    />
  );
}
