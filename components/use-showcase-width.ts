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
    const update = (width: number) => setCardsPerPage(premiumCardsPerPage(width));
    const style = getComputedStyle(node);
    update(node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, cardsPerPage };
}
