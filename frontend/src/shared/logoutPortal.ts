import gsap from 'gsap';

let running = false;

/**
 * Panel → merkeze küçülüp bulanıklaşır (portal), kısa “Görüşürüz”, sonra siyah perde.
 * Ekran siyah kalır; çağıran logout + navigate sonrası dismissLogoutPortal() çağırmalı.
 */
export function playLogoutPortal(): Promise<void> {
  if (running) return Promise.resolve();
  running = true;

  return new Promise((resolve) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shell = document.querySelector<HTMLElement>('[data-app-shell]');

    const overlay = document.createElement('div');
    overlay.setAttribute('data-logout-portal', '');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'pointer-events:auto',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:#000',
      'opacity:0',
    ].join(';');

    const farewell = document.createElement('div');
    farewell.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:14px',
      'opacity:0',
      'transform:scale(0.86)',
      'will-change:transform,opacity',
    ].join(';');

    const pulse = document.createElement('div');
    pulse.style.cssText = [
      'width:10px',
      'height:10px',
      'border-radius:999px',
      'background:#fff',
      'box-shadow:0 0 0 0 rgba(255,255,255,0.45)',
    ].join(';');

    const label = document.createElement('p');
    label.textContent = 'Görüşürüz';
    label.style.cssText = [
      'margin:0',
      'font-family:"DM Sans",system-ui,sans-serif',
      'font-size:13px',
      'font-weight:600',
      'letter-spacing:0.14em',
      'text-transform:uppercase',
      'color:rgba(255,255,255,0.82)',
    ].join(';');

    farewell.append(pulse, label);
    overlay.appendChild(farewell);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const finish = () => {
      // Perde siyah kalsın; login’e geçişte dismiss edilir
      resolve();
    };

    if (reduced || !shell) {
      gsap
        .timeline({ onComplete: finish })
        .to(overlay, { opacity: 1, duration: 0.4, ease: 'power2.inOut' })
        .to(farewell, { opacity: 1, scale: 1, duration: 0.25 }, '-=0.15')
        .to(farewell, { opacity: 0, scale: 0.7, duration: 0.2, delay: 0.15 });
      return;
    }

    gsap.set(shell, {
      transformOrigin: '50% 50%',
      willChange: 'transform, filter, opacity',
      borderRadius: 0,
      overflow: 'hidden',
    });

    const tl = gsap.timeline({
      defaults: { ease: 'power3.inOut' },
      onComplete: finish,
    });

    // Panel merkeze çekilir, bulanıklaşır
    tl.to(
      shell,
      {
        scale: 0.55,
        filter: 'blur(6px)',
        borderRadius: 28,
        duration: 0.55,
        ease: 'power2.inOut',
      },
      0,
    )
      .to(overlay, { opacity: 0.35, duration: 0.45, ease: 'power1.out' }, 0.05)
      // Daha da küçül → portal noktası
      .to(
        shell,
        {
          scale: 0.08,
          filter: 'blur(18px)',
          opacity: 0.35,
          borderRadius: 999,
          duration: 0.7,
          ease: 'power3.in',
        },
        0.45,
      )
      .to(overlay, { opacity: 0.92, duration: 0.55 }, 0.5)
      // Merkez nabız + metin
      .to(
        farewell,
        { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.6)' },
        0.7,
      )
      .to(
        pulse,
        {
          boxShadow: '0 0 0 18px rgba(255,255,255,0)',
          duration: 0.7,
          ease: 'power1.out',
        },
        0.75,
      )
      .to(
        shell,
        {
          scale: 0.02,
          opacity: 0,
          duration: 0.35,
          ease: 'power2.in',
        },
        1.05,
      )
      .to(farewell, { scale: 0.6, opacity: 0, duration: 0.35, ease: 'power2.in' }, 1.15)
      .to(overlay, { opacity: 1, duration: 0.25 }, 1.25);
  });
}

/** Login’e geçtikten sonra siyah perdeyi yumuşak kaldır */
export function dismissLogoutPortal() {
  const overlays = document.querySelectorAll<HTMLElement>('[data-logout-portal]');
  overlays.forEach((overlay) => {
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => overlay.remove(),
    });
  });
  document.body.style.overflow = '';
  running = false;
}
