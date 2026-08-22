import { useId } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface ThreadProps {
  /** SVG path "d" attribute describing the connection between two points. */
  path: string;
  /** viewBox for the SVG, e.g. "0 0 400 120" */
  viewBox: string;
  className?: string;
  delay?: number;
  duration?: number;
}

/**
 * The Thread — the app's signature device: a hand-drawn line that connects
 * two related data points on load. Use once per view, as an orchestrated
 * moment, never as ambient decoration.
 */
export function Thread({
  path,
  viewBox,
  className = "",
  delay = 0.15,
  duration = 0.8,
}: ThreadProps) {
  const gradientId = useId();
  const reduced = useReducedMotion();

  return (
    <svg
      viewBox={viewBox}
      className={className}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5B5FEF" />
          <stop offset="100%" stopColor="#2F6E68" />
        </linearGradient>
        <filter id={`${gradientId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.path
        d={path}
        stroke={`url(#${gradientId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        filter={`url(#${gradientId}-glow)`}
        initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 0.9 }}
        animate={reduced ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
        transition={
          reduced
            ? { duration: 0.2, delay }
            : { duration, delay, ease: [0.16, 1, 0.3, 1] }
        }
      />
    </svg>
  );
}
