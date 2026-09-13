"use client";
import { useEffect, useRef, type ReactNode } from "react";

// iOS resizes only the visual viewport for the keyboard, not the layout viewport.
// Scope the adjustment to this mounted conversation; preserve browser pinch zoom.
export function ChatShell({ children }: { children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!shell.current) return;
        if (viewport.scale !== 1) return;
        const mobile = window.matchMedia("(max-width: 700px)").matches;
        shell.current.style.setProperty("--chat-height", mobile ? `${viewport.height}px` : "100dvh");
        shell.current.style.setProperty("--chat-top", mobile ? `${viewport.offsetTop}px` : "0px");
        shell.current.dataset.keyboard = String(mobile && window.innerHeight - viewport.height > 120);
      });
    };
    update(); viewport.addEventListener("resize", update); viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return <div className="chat-shell" ref={shell}>{children}</div>;
}
