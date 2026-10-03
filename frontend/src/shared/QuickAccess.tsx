import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { NavIcon } from "./NavIcon";
import type { PanelPage, View } from "./types";

const iconByView: Record<PanelPage, string> = {
  dashboard: "home",
  new: "code",
  keys: "briefcase",
  statistics: "chart",
  playground: "play",
  "schema-keys": "database",
  settings: "gear",
  appearance: "sliders",
};
const labelByView: Record<PanelPage, string> = {
  dashboard: "Genel Yönetim",
  new: "Yeni Kategori",
  keys: "API Anahtarları",
  statistics: "İstatistikler",
  playground: "API Deneme Alanı",
  "schema-keys": "Şema",
  settings: "Ayarlar",
  appearance: "Görünüm",
};
type Drag = { view: PanelPage; x: number; y: number };
type Access = {
  slots: (PanelPage | null)[];
  drag: Drag | null;
  hoverSlot: number | null;
  assign: (index: number, view: PanelPage | null) => void;
  pointerDown: (event: ReactPointerEvent, view: PanelPage) => void;
  cancelHold: () => void;
  onNavClick: (event: MouseEvent, navigate: () => void) => void;
};

export function useQuickAccess(slots: (PanelPage | null)[], onChange: (slots: (PanelPage | null)[]) => void): Access {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const assign = useCallback((index: number, view: PanelPage | null) => {
    if (index < 0 || index >= slots.length) return;
    const next = [...slots];
    if (view) next.forEach((item, slot) => { if (item === view) next[slot] = null; });
    next[index] = view;
    onChange(next);
  }, [slots, onChange]);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      setDrag(current => current ? { ...current, x: event.clientX, y: event.clientY } : null);
      const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-quick-slot]");
      setHoverSlot(slot ? Number(slot.dataset.quickSlot) : null);
    };
    const up = (event: PointerEvent) => {
      const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-quick-slot]");
      if (slot) assign(Number(slot.dataset.quickSlot), drag.view);
      setDrag(null);
      setHoverSlot(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, assign]);
  useEffect(() => () => { if (holdTimer.current) window.clearTimeout(holdTimer.current); }, []);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);
  const pointerDown = useCallback((event: ReactPointerEvent, view: PanelPage) => {
    if (event.button !== 0) return;
    cancelHold();
    suppressClick.current = false;
    const x = event.clientX, y = event.clientY;
    holdTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      setDrag({ view, x, y });
      holdTimer.current = null;
    }, 380);
  }, [cancelHold]);
  const onNavClick = useCallback((event: MouseEvent, navigate: () => void) => {
    if (suppressClick.current || drag) {
      event.preventDefault();
      suppressClick.current = false;
      return;
    }
    navigate();
  }, [drag]);

  return { slots, drag, hoverSlot, assign, pointerDown, cancelHold, onNavClick };
}

export function QuickAccessSlots({ access, activeView, onOpen }: { access: Access; activeView: View; onOpen: (view: View) => void }) {
  if (!access.slots.length) return null;
  return <div className="workspace-quick-access" title="Sol menü öğesini basılı tutup buraya sürükleyin">
    {access.slots.map((view, index) => <div key={index} data-quick-slot={index} className={`workspace-quick-slot ${access.hoverSlot === index ? "drop-target" : ""} ${view === activeView ? "active" : ""}`}>
      {view ? <button title={`${labelByView[view]} · sağ tıkla kaldır`} onClick={() => onOpen(view)} onContextMenu={event => { event.preventDefault(); access.assign(index, null); }}><NavIcon name={iconByView[view]} size={17} /></button> : <span>+</span>}
    </div>)}
  </div>;
}

export function QuickAccessGhost({ drag }: { drag: Drag | null }) {
  if (!drag) return null;
  return <div className="workspace-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden><NavIcon name={iconByView[drag.view]} size={18} /></div>;
}
