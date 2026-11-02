"use client";
import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap, movimientoReducido, registrar } from "./motion";

/**
 * Smooth page scroll, mounted once in the root layout. Its raf runs on
 * gsap.ticker; under reduced motion it is never created. Any element that
 * scrolls on its own inside the layout carries `data-lenis-prevent`.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (movimientoReducido()) return;
    registrar();
    const lenis = new Lenis({ autoRaf: false, anchors: true });
    const tick = (tiempo: number) => lenis.raf(tiempo * 1000);
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
  return children;
}
