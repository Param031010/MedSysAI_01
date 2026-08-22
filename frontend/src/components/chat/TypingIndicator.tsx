import { motion } from "framer-motion";

export function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-l-[1.5px] border-teal-deep py-1 pl-4">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-stone"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      {label && <span className="font-mono text-[11px] text-stone">{label}</span>}
    </div>
  );
}
