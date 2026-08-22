import { motion } from "framer-motion";
import { fadeUpMessage } from "@/lib/motion";
import { Markdown } from "./Markdown";
import type { ChatMessage } from "@/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
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
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[80%] sm:max-w-[65%] ${isUser ? "text-right" : "text-left"}`}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-surface-card px-4 py-3">
            <p className="text-[14px] leading-relaxed text-ink">{message.content}</p>
          </div>
        ) : (
          <div className="border-l-[1.5px] border-teal-deep pl-4 text-[14px] leading-relaxed text-ink/90">
            <Markdown content={message.content} />
          </div>
        )}
        <p className="mt-1.5 font-mono text-[11px] text-stone">{time}</p>
      </div>
    </motion.div>
  );
}
