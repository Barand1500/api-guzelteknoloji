import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Check } from "lucide-react";
import type { Column } from "../../shared/types";

type FieldType = Column["fieldType"];
type Group = "text" | "number" | "boolean" | "date" | "relation" | "image";

const groups: { id: Group; label: string; description: string }[] = [
  { id: "text", label: "Metin", description: "Yazı ve açıklamalar" },
  { id: "number", label: "Sayı", description: "Tamsayı veya ondalık" },
  { id: "boolean", label: "Boolean", description: "İki durumlu değer" },
  { id: "date", label: "Tarih", description: "Gün, ay ve yıl" },
  { id: "relation", label: "Bağlantı", description: "Başka tabloya ilişki" },
  { id: "image", label: "Görsel", description: "Dosya veya Base64" },
];

const choices: Record<Group, { type: FieldType; label: string; description: string }[]> = {
  text: [{ type: "text", label: "Metin", description: "Serbest yazı · LONGTEXT" }],
  number: [
    { type: "integer", label: "Tamsayı (INT)", description: "Ondalık içermez · INT" },
    { type: "float", label: "Ondalıklı sayı (FLOAT)", description: "Kesirli değerler · DOUBLE" },
  ],
  boolean: [
    { type: "boolean_text", label: "Boolean (true / false)", description: "Veritabanında yazı olarak saklanır" },
    { type: "boolean", label: "Boolean (1 / 0)", description: "Veritabanında sayı olarak saklanır" },
  ],
  date: [{ type: "date", label: "Tarih", description: "YYYY-AA-GG · DATE" }],
  relation: [{ type: "relation", label: "Bağlamsal anahtar", description: "Başka tablonun ID alanına bağlanır" }],
  image: [{ type: "image", label: "Görsel", description: "Yükleme veya Base64 · LONGTEXT" }],
};

export const fieldTypeLabels: Record<FieldType, string> = {
  text: "Metin",
  number: "Ondalıklı sayı (DECIMAL)",
  integer: "Tamsayı (INT)",
  float: "Ondalıklı sayı (FLOAT)",
  boolean: "Boolean (1 / 0)",
  boolean_text: "Boolean (true / false)",
  date: "Tarih",
  relation: "Bağlamsal anahtar",
  image: "Görsel",
};

export default function FieldTypePicker({ value, onChange }: { value: FieldType; onChange: (type: FieldType) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<Group | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  return <div className="editor-type-picker" ref={root}>
    <button type="button" className="editor-type-trigger" aria-expanded={open} onClick={() => { setOpen(current => !current); setGroup(null); }}>
      <span><small>Sütun türü</small><strong>{fieldTypeLabels[value]}</strong></span><ChevronDown size={18} />
    </button>
    {open && <div className="editor-type-menu">
      {group ? <>
        <button type="button" className="editor-type-back" onClick={() => setGroup(null)}><ArrowLeft size={15} /> Tür grupları</button>
        <h4>{groups.find(item => item.id === group)?.label}</h4>
        {choices[group].map(choice => <button type="button" className="editor-type-option" key={choice.type} onClick={() => { onChange(choice.type); setOpen(false); setGroup(null); }}>
          <span><strong>{choice.label}</strong><small>{choice.description}</small></span>{value === choice.type && <Check size={16} />}
        </button>)}
      </> : <>
        <h4>Önce bir tür grubu seçin</h4>
        {groups.map(item => <button type="button" className="editor-type-option" key={item.id} onClick={() => setGroup(item.id)}>
          <span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronDown size={15} className="editor-type-next" />
        </button>)}
      </>}
    </div>}
  </div>;
}
