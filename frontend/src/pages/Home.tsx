import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBanner } from "@/components/home/StatusBanner";
import { EnvironmentCard } from "@/components/home/EnvironmentCard";
import { TipsCard } from "@/components/home/TipsCard";
import { KnowledgeGraphCard } from "@/components/home/KnowledgeGraphCard";
import { Thread } from "@/components/Thread";
import { LoadError } from "@/components/LoadError";
import { staggerContainer, riseIn, riseInReduced } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { getHomeSnapshot } from "@/services/home";
import { ApiError } from "@/services/client";
import type { HomeSnapshot } from "@/types";

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      const reason = err.detail ? ` (${err.detail})` : "";
      return `Your session may have expired — try refreshing the page.${reason}`;
    }
    if (err.status) {
      const reason = err.detail ? `: ${err.detail}` : "";
      return `Couldn't load your dashboard — the backend returned an error (${err.status})${reason}.`;
    }
  }
  return "Couldn't load your dashboard — the backend may be unreachable.";
}

const dateLabel = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const [data, setData] = useState<HomeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const reduced = useReducedMotion();
  const item = reduced ? riseInReduced : riseIn;

  useEffect(() => {
    let active = true;
    setError(null);

    function attemptLoad() {
      getHomeSnapshot()
        .then((snapshot) => {
          if (active) setData(snapshot);
        })
        .catch((err) => {
          if (!active) return;
          // A 401/403 is usually a transient Clerk-token timing issue (e.g.
          // clock skew), not a real expired session, and it self-corrects —
          // keep quietly retrying behind the loading state instead of
          // surfacing an error the user has to notice and act on.
          const authFlaky = err instanceof ApiError && (err.status === 401 || err.status === 403);
          if (authFlaky) {
            setTimeout(() => {
              if (active) attemptLoad();
            }, 1500);
            return;
          }
          setError(describeError(err));
        });
    }

    attemptLoad();
    return () => {
      active = false;
    };
  }, [retryKey]);

  function refresh() {
    getHomeSnapshot()
      .then(setData)
      .catch(() => {
        /* keep showing the current snapshot — this is a background refresh, not the initial load */
      });
  }

  return (
    <div>
      <PageHeader eyebrow="Home" title={`${greeting()}.`} meta={dateLabel} />

      {error ? (
        <LoadError message={error} onRetry={() => setRetryKey((k) => k + 1)} />
      ) : !data ? (
        <div className="px-5 py-16 text-center text-sm text-stone sm:px-8">
          Loading your dashboard…
        </div>
      ) : (
        <motion.div
          className="flex flex-col gap-6 px-5 pb-16 pt-8 sm:px-8"
          variants={staggerContainer(0.1)}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={item}>
            <StatusBanner status={data.status} note={data.statusNote} />
          </motion.div>

          <motion.div
            variants={item}
            className="relative grid grid-cols-1 gap-6 lg:grid-cols-2"
          >
            <EnvironmentCard data={data.environment} id="env-card" />
            <TipsCard tip={data.tip} id="tip-card" />
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 hidden h-10 w-24 -translate-x-1/2 -translate-y-1/2 lg:block"
              aria-hidden="true"
            >
              <Thread
                path="M0 20 C 24 4, 72 36, 96 20"
                viewBox="0 0 96 40"
                className="h-full w-full"
                delay={0.5}
                duration={0.7}
              />
            </div>
          </motion.div>

          <motion.div variants={item}>
            <TipsCard tip={data.generalTip} heading="General tip" icon={Lightbulb} />
          </motion.div>

          <motion.div variants={item}>
            <KnowledgeGraphCard graph={data.graph} onLogged={refresh} />
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
