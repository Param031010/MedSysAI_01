import { motion } from "framer-motion";
import { fadeUpMessage } from "@/lib/motion";
import { Markdown } from "./Markdown";
import type { ChatMessage } from "@/types";

export function MessageBubble({
  message,
  onSelectOption,
}: {
  message: ChatMessage;
  onSelectOption?: (option: string) => void;
}) {
  const isUser = message.role === "user";
  const time = new Date(message.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <motion.div
      variants={fadeUpMessage}
      initial="hidden"
      animate="show"
      className={`flex min-w-0 max-w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[90%] sm:max-w-[85%] min-w-0 ${isUser ? "text-right" : "text-left"}`}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-surface-card px-4 py-3">
            <p className="text-[14px] leading-relaxed text-ink">{message.content}</p>
          </div>
        ) : (
          <div className={`border-l-[2px] ${message.isRedFlag ? "border-red-500 bg-red-50/10 p-3 rounded-r-lg" : "border-teal-deep"} pl-4 text-[14px] leading-relaxed text-ink/90 min-w-0 max-w-full overflow-hidden`}>
            <Markdown content={message.content} />

            {message.quickOptions && message.quickOptions.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2 pt-2">
                {message.quickOptions.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSelectOption?.(option)}
                    className="rounded-full border border-teal-deep/30 bg-surface-card px-3.5 py-1.5 text-[12px] font-medium text-teal-deep transition-all hover:border-teal-deep hover:bg-teal-deep/10 active:scale-95"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <p className="mt-1.5 font-mono text-[11px] text-stone">{time}</p>
      </div>
    </motion.div>
  );
}

