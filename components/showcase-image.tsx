/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useRef, useState } from "react";

export type ShowcaseImageState = "ready" | "error";

/** Retain the real img node across carousel pages; native decoded pixels are reused. */
export function ShowcaseImage({ src, prepare, expanded, current, onSettled }: {
  src: string;
  prepare: boolean;
  expanded: boolean;
  current: boolean;
  onSettled: (src: string, state: ShowcaseImageState) => void;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  const settled = useRef<ShowcaseImageState | null>(null);
  const startedAt = useRef<number | null>(null);
  const report = useRef(onSettled);
  useEffect(() => {
    report.current = onSettled;
    // A city and national scope may retain the same decoded img node.
    if (settled.current) onSettled(src, settled.current);
  }, [onSettled, src]);
  useEffect(() => {
    const image = ref.current;
    if (!image || (!prepare && !expanded) || settled.current) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (state: ShowcaseImageState) => {
      if (disposed || settled.current) return;
      settled.current = state;
      clearTimeout(timer);
      if (state === "error") { setFailed(true); image.removeAttribute("src"); }
      report.current(src, state);
    };
    const decode = async () => {
      try { await image.decode(); if (image.naturalWidth) finish("ready"); else finish("error"); }
      catch { finish("error"); }
    };
    const startDeadline = () => {
      if (startedAt.current === null) startedAt.current = Date.now();
      if (!timer) timer = setTimeout(() => finish("error"), Math.max(0, 10000 - (Date.now() - startedAt.current)));
    };
    const loaded = () => { startDeadline(); void decode(); };
    const error = () => finish("error");
    image.addEventListener("load", loaded);
    image.addEventListener("error", error);
    // Assign exactly once. No blob cache, URL churn, or new request on each cycle.
    if (image.getAttribute("src") !== src) image.src = src;
    if (prepare) startDeadline();
    if (image.complete && image.naturalWidth) void decode();
    return () => {
      disposed = true;
      clearTimeout(timer);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", error);
    };
  }, [src, prepare, expanded]);
  return <img ref={ref} className="listing-image" alt="" loading={prepare ? "eager" : "lazy"}
    fetchPriority={current ? "high" : "low"} decoding="async" style={failed ? { display: "none" } : undefined} />;
}
