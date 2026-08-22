import { motion } from "framer-motion";
import { Link, Navigate } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Activity, MessageSquare, MapPinned, FileStack } from "lucide-react";
import { Thread } from "@/components/Thread";
import { staggerContainer, riseIn, riseInReduced } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const FEATURES = [
  {
    icon: Activity,
    title: "One glance, whole picture",
    body: "A daily status read, live weather and air quality, and a knowledge-graph alert the moment two logged symptoms form a pattern worth flagging.",
  },
  {
    icon: MessageSquare,
    title: "Chat grounded on your records",
    body: "Ask questions against documents you choose — nothing else leaks in. Deep web search and voice input included.",
  },
  {
    icon: MapPinned,
    title: "Find care nearby",
    body: "Search hospitals, clinics, and diagnostic centers around you, filtered by specialty and distance.",
  },
  {
    icon: FileStack,
    title: "Every record, organized",
    body: "Upload prescriptions, reports, and consultation notes — OCR and an LLM turn them into structured, searchable cards.",
  },
];

export default function Landing() {
  const reduced = useReducedMotion();
  const item = reduced ? riseInReduced : riseIn;

  return (
    <div className="min-h-dvh bg-bg-mist text-ink">
      <SignedIn>
        <Navigate to="/dashboard" replace />
      </SignedIn>

      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-5 pt-6 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-bg-mist">
            <ThreadMark />
          </span>
          <span className="font-display text-lg tracking-tight">MedSys</span>
        </div>
        <SignedOut>
          <div className="flex items-center gap-2">
            <Link
              to="/sign-in"
              className="rounded-full px-4 py-2 text-sm text-stone transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              to="/sign-up"
              className="rounded-full bg-ink px-4 py-2 text-sm text-bg-mist transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </SignedOut>
      </header>

      <motion.main
        className="mx-auto flex max-w-[1100px] flex-col gap-24 px-5 pb-24 pt-16 sm:px-8 sm:pt-24"
        variants={staggerContainer(0.1)}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="relative">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-stone">
            Personal health intelligence
          </p>
          <h1 className="max-w-[16ch] font-display text-[42px] leading-[1.08] tracking-tight sm:text-[58px]">
            Your health record, finally legible.
          </h1>
          <p className="mt-6 max-w-[46ch] text-base text-stone sm:text-lg">
            MedSys keeps every report, chat, and symptom in one grounded
            place — and quietly connects the dots you'd otherwise miss.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <SignedOut>
              <Link
                to="/sign-up"
                className="rounded-full bg-ink px-6 py-3 text-sm text-bg-mist transition-opacity hover:opacity-90"
              >
                Create your account
              </Link>
              <Link
                to="/sign-in"
                className="rounded-full border border-hairline px-6 py-3 text-sm text-ink transition-colors hover:bg-surface-card"
              >
                Sign in
              </Link>
            </SignedOut>
          </div>
          <div
            className="pointer-events-none absolute -bottom-10 left-0 hidden h-10 w-64 sm:block"
            aria-hidden="true"
          >
            <Thread
              path="M0 20 C 60 0, 200 40, 260 12"
              viewBox="0 0 260 40"
              className="h-full w-full"
              delay={0.6}
              duration={0.9}
            />
          </div>
        </motion.div>

        <motion.div
          variants={item}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-hairline bg-surface-card p-6"
            >
              <feature.icon
                className="mb-4 h-5 w-5 text-teal-deep"
                strokeWidth={1.75}
              />
              <h2 className="font-display text-lg tracking-tight">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm text-stone">{feature.body}</p>
            </div>
          ))}
        </motion.div>

        <motion.div
          variants={item}
          className="rounded-2xl border border-hairline bg-surface-card p-8 text-center sm:p-12"
        >
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
            Ready to see the whole picture?
          </h2>
          <p className="mx-auto mt-2 max-w-[40ch] text-sm text-stone">
            Sign up in seconds — your data stays yours, grounded and private.
          </p>
          <SignedOut>
            <Link
              to="/sign-up"
              className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-sm text-bg-mist transition-opacity hover:opacity-90"
            >
              Get started free
            </Link>
          </SignedOut>
        </motion.div>
      </motion.main>

      <footer className="mx-auto max-w-[1100px] px-5 pb-10 text-center font-mono text-[11px] text-stone sm:px-8">
        MedSys AI — personal, local-first health intelligence.
      </footer>
    </div>
  );
}

function ThreadMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 12C5 12 5 4 8 4C11 4 11 12 14 12"
        stroke="url(#landingThreadGrad)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="landingThreadGrad" x1="0" y1="0" x2="16" y2="0">
          <stop offset="0%" stopColor="#5B5FEF" />
          <stop offset="100%" stopColor="#2F6E68" />
        </linearGradient>
      </defs>
    </svg>
  );
}
