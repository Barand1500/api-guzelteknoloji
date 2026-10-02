import * as React from 'react';
import { useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import { useReducedMotion } from 'framer-motion';

const radiusFromPercent = (w: number, h: number, pct: number) =>
  (Math.min(w, h) / 2) * (Math.max(0, Math.min(100, pct)) / 100);

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const GOO_STRENGTH = 8;

const FOLLOW_TAU_MIN = 0.02;
const FOLLOW_TAU_MAX = 0.4;
const SQUASH_TAU = 0.09;
const SQUASH_PER_PX_PER_SEC = 0.0011;
const SQUASH_MAX = 1.6;
/** Carve açılma/kapanma yumuşaklığı (saniye) */
const BITE_TAU = 0.13;

type RGBA = { r: number; g: number; b: number; a: number };
const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

function parseColor(input?: string): RGBA {
  if (!input) return WHITE;
  let c = String(input).trim();
  const token = c.match(/^var\([^,]+,\s*(.+)\)$/i);
  if (token) c = token[1].trim();
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((ch) => ch + ch)
        .join('');
    if (h.length !== 6 && h.length !== 8) return WHITE;
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return WHITE;
    return h.length === 6
      ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
      : {
          r: (n >>> 24) & 255,
          g: (n >>> 16) & 255,
          b: (n >>> 8) & 255,
          a: (n & 255) / 255,
        };
  }
  const fn = c.match(/rgba?\(([^)]+)\)/i);
  if (fn) {
    const p = fn[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    if (p.length >= 3 && p.slice(0, 3).every((v) => !Number.isNaN(v)))
      return {
        r: p[0],
        g: p[1],
        b: p[2],
        a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1,
      };
  }
  return WHITE;
}

const opaque = (c: RGBA) =>
  `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

type Colors = {
  fill?: string;
  textColor?: string;
  /** Yuvarlak kenar çizgisi */
  border?: string;
};

type BlobConfig = {
  color?: string;
  size?: number;
  smoothness?: number;
};

type Props = {
  colors?: Colors;
  label?: React.ReactNode;
  /** Erişilebilir isim (label ReactNode ise) */
  ariaLabel?: string;
  font?: React.CSSProperties;
  padding?: string;
  rounded?: number;
  blob?: BlobConfig;
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
  /** true iken disabled görünümü soluklaştırmaz (Kaydedildi) */
  keepOpaque?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Liquid Carve — imleci takip eden gooey oyuk.
 * Site geneli birincil buton görseli (Button bunu sarar).
 */
export default function LiquidCarveButton({
  label = 'LIQUID CARVE',
  ariaLabel,
  font = {
    fontFamily: '"DM Sans", sans-serif',
    fontWeight: 700,
    fontSize: 14,
    lineHeight: '1.2em',
    letterSpacing: '0.02em',
    textAlign: 'center',
  },
  padding = '14px 28px',
  rounded = 40,
  colors = { fill: '#FFFFFF', textColor: '#000000', border: '#D1D5DB' },
  blob: blobGroup = { size: 72, color: '#FF3737', smoothness: 50 },
  style,
  className,
  disabled = false,
  keepOpaque = false,
  type = 'button',
  onClick,
}: Props) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const followRef = useRef<SVGGElement>(null);
  const squashRef = useRef<SVGGElement>(null);
  const biteRef = useRef<SVGGElement>(null);
  const hovered = useRef(false);
  const chase = useRef({ x: 0, y: 0, tx: 0, ty: 0, squash: 1, angle: 0, bite: 0 });
  const reducedMotion = useReducedMotion();

  const [box, setBox] = useState({ w: 0, h: 0 });
  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () =>
      setBox((prev) =>
        prev.w === el.offsetWidth && prev.h === el.offsetHeight
          ? prev
          : { w: el.offsetWidth, h: el.offsetHeight },
      );
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rad = Math.max(0, Math.floor(radiusFromPercent(box.w, box.h, rounded)));
  const { color: blobColor = '#FF3737', size: blobSize = 72, smoothness = 50 } = blobGroup;
  const blob = Math.max(1, Math.floor(blobSize));

  const fillRGB = parseColor(colors?.fill ?? '#FFFFFF');
  const blobRGB = parseColor(blobColor);
  const textColor = colors?.textColor ?? '#000000';
  const borderColor = colors?.border ?? '#D1D5DB';
  void keepOpaque;

  const rawId = useId();
  const uid = rawId.replace(/[:]/g, '');
  const filterId = `goo-${uid}`;
  const maskId = `bite-${uid}`;
  const clipId = `clip-${uid}`;

  const live = useRef({ smoothness, reducedMotion });
  live.current = { smoothness, reducedMotion };

  // Tek rAF döngüsü: takip + squash + carve ölçeği
  useEffect(() => {
    let last = 0;
    let raf = 0;

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      const st = chase.current;
      const { smoothness: sm, reducedMotion: rm } = live.current;
      const t = Math.max(0, Math.min(100, Math.round(sm))) / 100;
      const tau = FOLLOW_TAU_MIN + t * (FOLLOW_TAU_MAX - FOLLOW_TAU_MIN);

      const k = rm ? 1 : 1 - Math.exp(-dt / tau);
      const dx = (st.tx - st.x) * k;
      const dy = (st.ty - st.y) * k;
      st.x += dx;
      st.y += dy;

      const speed = Math.hypot(dx, dy) / Math.max(dt, 1e-4);
      const wantSquash = rm ? 1 : Math.min(SQUASH_MAX, 1 + speed * SQUASH_PER_PX_PER_SEC);
      st.squash += (wantSquash - st.squash) * (1 - Math.exp(-dt / SQUASH_TAU));
      if (speed > 8) st.angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const wantBite = hovered.current ? 1 : 0;
      st.bite = rm
        ? wantBite
        : st.bite + (wantBite - st.bite) * (1 - Math.exp(-dt / BITE_TAU));
      if (Math.abs(st.bite - wantBite) < 0.001) st.bite = wantBite;

      const f = followRef.current;
      if (f) f.setAttribute('transform', `translate(${st.x} ${st.y})`);
      const q = squashRef.current;
      if (q)
        q.setAttribute(
          'transform',
          `rotate(${st.angle}) scale(${st.squash} ${1 / st.squash})`,
        );
      const b = biteRef.current;
      if (b) b.setAttribute('transform', `scale(${Math.max(st.bite, 0.0001)})`);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pointTo = (e: React.PointerEvent, snap: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const st = chase.current;
    st.tx = dx;
    st.ty = dy;
    if (snap) {
      st.x = dx;
      st.y = dy;
    }
  };

  const onEnter = (e: React.PointerEvent) => {
    if (disabled) return;
    hovered.current = true;
    pointTo(e, true);
  };

  const onMove = (e: React.PointerEvent) => {
    if (disabled) return;
    // Enter kaçtıysa burada da yakala
    hovered.current = true;
    pointTo(e, false);
  };

  const onLeave = () => {
    hovered.current = false;
  };

  const shellStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding,
    width: '100%',
    cursor: disabled ? 'not-allowed' : 'pointer',
    userSelect: 'none',
    boxSizing: 'border-box',
    overflow: 'visible',
    opacity: 1,
    touchAction: 'manipulation',
    border: 'none',
    background: 'transparent',
    appearance: 'none',
    WebkitAppearance: 'none',
    outline: 'none',
    ...style,
  };

  const cx = box.w / 2;
  const cy = box.h / 2;
  const accessibleName =
    ariaLabel || (typeof label === 'string' || typeof label === 'number' ? String(label) : undefined);

  return (
    <button
      ref={rootRef}
      type={type}
      disabled={disabled}
      aria-label={accessibleName}
      className={className}
      style={shellStyle}
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerCancel={onLeave}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      <svg
        aria-hidden
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <defs>
          {/* Geniş filtre bölgesi: blob kenarda kırpılmasın */}
          <filter
            id={filterId}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            filterUnits="objectBoundingBox"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation={GOO_STRENGTH} result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
            />
          </filter>

          {/* Goo taşmasını yuvarlak köşede kes — kırmızı dikdörtgen kutu olmasın */}
          <clipPath id={clipId}>
            <rect x="0" y="0" width={Math.max(box.w, 1)} height={Math.max(box.h, 1)} rx={rad} ry={rad} />
          </clipPath>

          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            <g transform={`translate(${cx} ${cy})`}>
              <g ref={followRef}>
                <g ref={squashRef}>
                  <g ref={biteRef}>
                    <circle cx="0" cy="0" r={blob / 2} fill="#000" />
                  </g>
                </g>
              </g>
            </g>
          </mask>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <g filter={`url(#${filterId})`} opacity={blobRGB.a}>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx={rad}
              ry={rad}
              fill={opaque(blobRGB)}
            />
          </g>

          <g filter={`url(#${filterId})`} opacity={fillRGB.a}>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx={rad}
              ry={rad}
              fill={opaque(fillRGB)}
              mask={`url(#${maskId})`}
            />
          </g>
        </g>

        {/* Yuvarlak border — CSS inset shadow değil */}
        {box.w > 0 ? (
          <rect
            x={1.25}
            y={1.25}
            width={Math.max(box.w - 2.5, 0)}
            height={Math.max(box.h - 2.5, 0)}
            rx={Math.max(rad - 1.25, 0)}
            ry={Math.max(rad - 1.25, 0)}
            fill="none"
            stroke={borderColor}
            strokeWidth={2.25}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      <span
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          ...font,
          color: textColor,
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
    </button>
  );
}
