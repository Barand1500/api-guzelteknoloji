import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { NavIcon } from "./NavIcon";
import type { View } from "./types";

const storageKey = "gtk_quick_access";
const slotCount = 6;
const allowed: View[] = ["dashboard", "keys", "settings", "new"];
const iconByView: Record<string, string> = { dashboard: "home", keys: "briefcase", settings: "gear", new: "code" };
const labelByView: Record<string, string> = { dashboard: "Genel Yönetim", keys: "API Anahtarları", settings: "Ayarlar", new: "Yeni Kategori" };
type Drag = { view: View; x: number; y: number };

function readSlots(): (View | null)[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Array.isArray(saved)) return Array.from({ length: slotCount }, (_, index) => allowed.includes(saved[index]) ? saved[index] : null);
  } catch { /* Use empty slots. */ }
  return Array(slotCount).fill(null);
}

export function useQuickAccess() {
  const [slots, setSlots] = useState<(View | null)[]>(readSlots);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(slots)); }, [slots]);
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
      setDrag(null); setHoverSlot(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag?.view]);
  useEffect(() => () => { if (holdTimer.current) window.clearTimeout(holdTimer.current); }, []);

  function assign(index: number, view: View | null) {
    if (index < 0 || index >= slotCount) return;
    setSlots(current => {
      const next = [...current].map(item => item === view && view !== null ? null : item);
      next[index] = view;
      return next;
    });
  }
  function pointerDown(event: ReactPointerEvent, view: View) {
    if (event.button !== 0) return;
    cancelHold(); suppressClick.current = false;
    const x = event.clientX, y = event.clientY;
    holdTimer.current = window.setTimeout(() => { suppressClick.current = true; setDrag({ view, x, y }); holdTimer.current = null; }, 380);
  }
  function cancelHold() { if (holdTimer.current) window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  function onNavClick(event: MouseEvent, navigate: () => void) {
    if (suppressClick.current || drag) { event.preventDefault(); suppressClick.current = false; return; }
    navigate();
  }
  return { slots, drag, hoverSlot, assign, pointerDown, cancelHold, onNavClick };
}

export function QuickAccessSlots({ access, activeView, onOpen }: { access: ReturnType<typeof useQuickAccess>; activeView: View; onOpen: (view: View) => void }) {
  return <div className="workspace-quick-access" title="Sol menü öğesini basılı tutup buraya sürükleyin">{access.slots.map((view, index) => <div key={index} data-quick-slot={index} className={`workspace-quick-slot ${access.hoverSlot === index ? "drop-target" : ""} ${view === activeView ? "active" : ""}`}>
    {view ? <button title={`${labelByView[view]} · sağ tıkla kaldır`} onClick={() => onOpen(view)} onContextMenu={event => { event.preventDefault(); access.assign(index, null); }}><NavIcon name={iconByView[view]} size={17} /></button> : <span>+</span>}
  </div>)}</div>;
}

export function QuickAccessGhost({ drag }: { drag: Drag | null }) {
  if (!drag) return null;
  return <div className="workspace-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden><NavIcon name={iconByView[drag.view]} size={18} /></div>;
}
