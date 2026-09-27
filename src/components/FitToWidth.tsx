"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scales a fixed-width child (e.g. a 210mm bill = 794px) down to fit its container,
 * keeping the container's height in sync so layouts don't jump.
 */
export function FitToWidth({
  naturalWidth = 794,
  maxScale = 1,
  children,
  className = "",
}: {
  naturalWidth?: number;
  maxScale?: number;
  children: ReactNode;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const update = () => {
      const w = o.clientWidth;
      const s = Math.min(maxScale, w / naturalWidth);
      setScale(s);
      setHeight(i.offsetHeight * s); // offsetHeight ignores the transform
    };
    const ro = new ResizeObserver(update);
    ro.observe(o);
    ro.observe(i);
    update();
    return () => ro.disconnect();
  }, [naturalWidth, maxScale]);

  return (
    <div ref={outer} className={`relative w-full overflow-hidden ${className}`} style={{ height }}>
      <div
        ref={inner}
        style={{ width: naturalWidth, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
