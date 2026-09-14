"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The split-flap — the one authored motion moment. It animates only when
 * its value actually changed: never on load, navigation, or filter.
 * Short tokens only (max 6 chars). design-spec.md §5.5
 */
export function Flap({
  value,
  className,
  as: Tag = "span",
  ariaLabelOverride,
}: {
  value: string;
  className?: string;
  as?: "span" | "div";
  ariaLabelOverride?: string;
}) {
  const prevValue = React.useRef(value);
  const [flipping, setFlipping] = React.useState(false);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevValue.current = value;
      return;
    }
    if (prevValue.current !== value) {
      setFlipping(true);
      prevValue.current = value;
      const t = setTimeout(() => setFlipping(false), 260);
      return () => clearTimeout(t);
    }
  }, [value]);

  const chars = value.slice(0, 6).split("");

  return (
    <Tag
      className={cn("inline-flex tabular", className)}
      aria-live="polite"
      aria-label={ariaLabelOverride}
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          className={cn("flap-cell inline-block", flipping && "flap-flipping")}
          style={flipping ? { animationDelay: `${i * 12}ms` } : undefined}
          aria-hidden="true"
        >
          {ch}
        </span>
      ))}
    </Tag>
  );
}
