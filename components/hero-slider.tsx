"use client";

import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CarFront, PackageOpen, Wrench } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { useCallback, useEffect, useRef, useState } from "react";

export type HeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  secondaryHref?: string;
  secondaryCta?: string;
  tone: "market" | "auto" | "property" | "services" | "jobs";
};

const slideIcons = {
  market: PackageOpen,
  auto: CarFront,
  property: Building2,
  services: Wrench,
  jobs: BriefcaseBusiness,
};

export function HeroSlider({
  slides,
  stats,
  previousLabel,
  nextLabel,
  slideLabel,
}: {
  slides: HeroSlide[];
  stats: Array<{ value: string; label: string }>;
  previousLabel: string;
  nextLabel: string;
  slideLabel: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manuallyControlled, setManuallyControlled] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeSlide = slides[activeIndex] ?? slides[0];
  const VisualIcon = slideIcons[activeSlide.tone];

  const selectSlide = useCallback((index: number, manual = false) => {
    setActiveIndex((index + slides.length) % slides.length);
    if (manual) setManuallyControlled(true);
  }, [slides.length]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (paused || manuallyControlled || media.matches || slides.length < 2) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, [manuallyControlled, paused, slides.length]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    selectSlide(activeIndex + (event.key === "ArrowRight" ? 1 : -1), true);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    selectSlide(activeIndex + (deltaX < 0 ? 1 : -1), true);
  }

  return <section
    className={`hero-slider hero-tone-${activeSlide.tone}`}
    aria-roledescription="carousel"
    aria-label={slideLabel}
    tabIndex={0}
    onKeyDown={handleKeyDown}
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
    }}
    onTouchStart={handleTouchStart}
    onTouchEnd={handleTouchEnd}
  >
    <article className="hero-card" aria-live="off" aria-label={`${activeIndex + 1} / ${slides.length}`}>
      <div className="hero-copy">
        <span className="eyebrow"><VisualIcon size={16} /> {activeSlide.eyebrow}</span>
        <h1>{activeSlide.title}</h1>
        <p>{activeSlide.description}</p>
        <div className="hero-actions">
          <Link href={activeSlide.href} className="primary-action">{activeSlide.cta} <ArrowRight size={18} /></Link>
          {activeSlide.secondaryHref && activeSlide.secondaryCta ? <Link href={activeSlide.secondaryHref} className="secondary-action">{activeSlide.secondaryCta}</Link> : null}
        </div>
        <div className="hero-stats">{stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <span className="hero-visual-halo" />
        <span className="hero-visual-icon"><VisualIcon size={92} strokeWidth={1.35} /></span>
        <span className="hero-visual-mark">M</span>
      </div>
    </article>
    <div className="hero-slider-controls">
      <button type="button" onClick={() => selectSlide(activeIndex - 1, true)} aria-label={previousLabel}><ArrowLeft size={19} /></button>
      <div className="hero-slider-dots" role="group" aria-label={slideLabel}>{slides.map((slide, index) => <button key={slide.id} type="button" className={index === activeIndex ? "is-active" : ""} onClick={() => selectSlide(index, true)} aria-label={`${slideLabel} ${index + 1}: ${slide.eyebrow}`} aria-current={index === activeIndex ? "true" : undefined} />)}</div>
      <button type="button" onClick={() => selectSlide(activeIndex + 1, true)} aria-label={nextLabel}><ArrowRight size={19} /></button>
    </div>
  </section>;
}
