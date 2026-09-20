"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { premiumCardsPerPage } from "@/lib/premium-showcase-presentation";

/** Observe the actual content box, including when the parent changes without a window resize. */
export function useShowcaseWidth() {
  const ref = useRef<HTMLElement>(null);
  const [cardsPerPage, setCardsPerPage] = useState(2);
  const [layoutReady, setLayoutReady] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const orientation = matchMedia("(orientation: landscape)");
    const shortLandscape = matchMedia("(orientation: landscape) and (min-width: 568px) and (max-width: 1000px) and (max-height: 500px)");
    let contentWidth = 0;
    const update = (width: number) => { contentWidth = width; setCardsPerPage(premiumCardsPerPage(width, orientation.matches, shortLandscape.matches)); };
    const rotate = () => update(contentWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (contentWidth && contentWidth !== entry.contentRect.width) node.style.removeProperty("--showcase-loaded-height");
      update(entry.contentRect.width);
      setLayoutReady(true);
      // Retain the last settled height during an in-flight city request.
      if (!node.querySelector(".showcase-grid-all") && entry.borderBoxSize?.[0]) {
        node.style.setProperty("--showcase-loaded-height", entry.borderBoxSize[0].blockSize + "px");
      } else if (node.querySelector(".showcase-grid-all")) node.style.removeProperty("--showcase-loaded-height");
    });
    observer.observe(node);
    orientation.addEventListener("change", rotate);
    shortLandscape.addEventListener("change", rotate);
    return () => { observer.disconnect(); orientation.removeEventListener("change", rotate); shortLandscape.removeEventListener("change", rotate); };
  }, []);
  return { ref, cardsPerPage, layoutReady };
}
