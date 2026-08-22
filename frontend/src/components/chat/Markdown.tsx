import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2.5 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2.5 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-[14px] font-semibold text-ink first:mt-0">{children}</h4>
  ),
  h2: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-[14px] font-semibold text-ink first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-[14px] font-semibold text-ink first:mt-0">{children}</h4>
  ),
  code: ({ children }) => (
    <code className="rounded bg-bg-mist px-1 py-0.5 font-mono text-[12.5px]">{children}</code>
  ),
  table: ({ children }) => (
    <div className="mb-2.5 overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-bg-mist">{children}</thead>,
  th: ({ children }) => (
    <th className="whitespace-nowrap px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-stone">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-hairline px-3 py-2 align-top">{children}</td>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-teal-deep underline">
      {children}
    </a>
  ),
};

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}
