import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { ArrowLeft, ArrowRight, Check, HelpCircle, X } from "lucide-react";
import type { GuideStep } from "./guideContent";

export default function GuideTour({ step, index, total, onPrevious, onNext, onClose }: {
  step: GuideStep;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState<number | null>(null);
  const highlight = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuestion(null); }, [index]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (panel.current) gsap.fromTo(panel.current, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .35, ease: "power3.out" });
    document.querySelector<HTMLElement>(".workspace-content")?.scrollTo({ top: 0 });
    const position = () => {
      const target = document.querySelector<HTMLElement>(step.target) || document.querySelector<HTMLElement>(".workspace-content");
      if (!target || !highlight.current) return;
      const rect = target.getBoundingClientRect();
      const left = Math.max(8, rect.left - 7);
      const top = Math.max(8, rect.top - 7);
      gsap.to(highlight.current, {
        left, top,
        width: Math.max(0, Math.min(window.innerWidth - left - 8, rect.width + 14)),
        height: Math.max(0, Math.min(window.innerHeight - top - 8, rect.height + 14)),
        autoAlpha: 1, duration: .42, ease: "power3.out",
      });
    };
    const timer = window.setTimeout(position, 90);
    const observer = new MutationObserver(position);
    const content = document.querySelector(".workspace-content");
    if (content) observer.observe(content, { childList: true, subtree: true });
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { window.clearTimeout(timer); observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [step, index]);

  return createPortal(<div className="guide-tour-layer" role="presentation">
    <div ref={highlight} className="guide-tour-highlight" aria-hidden="true" />
    <div ref={panel} className="guide-tour-panel" role="dialog" aria-modal="false" aria-labelledby="guide-tour-title">
      <div className="guide-tour-top"><span>{step.eyebrow} <b>·</b> {index + 1}/{total}</span><button type="button" onClick={onClose} aria-label="Turu kapat"><X size={17} /></button></div>
      <div className="guide-tour-main"><video autoPlay loop muted playsInline preload="metadata" poster="/guide-mascot-poster.png" aria-hidden="true"><source src="/guide-mascot.webm" type="video/webm" /></video><div><h2 id="guide-tour-title">{step.title}</h2><p>{step.text}</p></div></div>
      <div className="guide-tour-questions"><span><HelpCircle size={16} /> Aklında soru var mı?</span><div>{step.questions.map((item, itemIndex) => <button type="button" key={item.question} className={question === itemIndex ? "active" : ""} onClick={() => setQuestion(question === itemIndex ? null : itemIndex)}>{item.question}</button>)}</div>{question !== null && <p className="guide-tour-answer"><Check size={16} />{step.questions[question].answer}</p>}</div>
      <div className="guide-tour-bottom"><div className="guide-tour-progress">{Array.from({ length: total }, (_, itemIndex) => <i key={itemIndex} className={itemIndex <= index ? "active" : ""} />)}</div><div><button type="button" onClick={onPrevious} disabled={index === 0}><ArrowLeft size={16} /> Geri</button><button type="button" className="primary" onClick={onNext}>{index === total - 1 ? "Turu bitir" : "Anladım, devam et"}<ArrowRight size={16} /></button></div></div>
    </div>
  </div>, document.body);
}
