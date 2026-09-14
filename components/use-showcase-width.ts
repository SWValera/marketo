"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { premiumCardsPerPage } from "@/lib/premium-showcase-presentation";

/** Observe the actual content box, including when the parent changes without a window resize. */
export function useShowcaseWidth() {
  const ref = useRef<HTMLElement>(null);
  const [cardsPerPage, setCardsPerPage] = useState(2);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const orientation = matchMedia("(orientation: landscape)");
    const shortLandscape = matchMedia("(orientation: landscape) and (min-width: 568px) and (max-width: 1000px) and (max-height: 500px)");
    let contentWidth = 0;
    const update = (width: number) => { contentWidth = width; setCardsPerPage(premiumCardsPerPage(width, orientation.matches, shortLandscape.matches)); };
    const rotate = () => update(contentWidth);
    const style = getComputedStyle(node);
    update(node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(node);
    orientation.addEventListener("change", rotate);
    shortLandscape.addEventListener("change", rotate);
    return () => { observer.disconnect(); orientation.removeEventListener("change", rotate); shortLandscape.removeEventListener("change", rotate); };
  }, []);
  return { ref, cardsPerPage };
}
