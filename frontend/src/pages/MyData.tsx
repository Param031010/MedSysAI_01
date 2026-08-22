import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DataCard } from "@/components/mydata/DataCard";
import { CategoryFilter } from "@/components/mydata/CategoryFilter";
import { SourceModal } from "@/components/SourceModal";
import { LoadError } from "@/components/LoadError";
import { staggerContainer, riseIn, riseInReduced } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { deleteMyDataSource, listMyData, uploadMyData } from "@/services/mydata";
import type { ChatSource, ChatSourceKind } from "@/types";

export default function MyData() {
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [category, setCategory] = useState<ChatSourceKind | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<ChatSource | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const item = reduced ? riseInReduced : riseIn;

  const filtered = useMemo(
    () => (category ? sources.filter((s) => s.kind === category) : sources),
    [sources, category],
  );

  useEffect(() => {
    let active = true;
    setLoadError(false);
    listMyData()
      .then((list) => {
        if (active) setSources(list);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadError(null);
    const tempId = `local-${Date.now()}`;
    setProcessingId(tempId);
    setSources((prev) => [
      {
        id: tempId,
        title: file.name,
        kind: "report",
        uploadedAt: new Date().toISOString().slice(0, 10),
        excerpt: "Reading and summarizing this document…",
      },
      ...prev,
    ]);

    try {
      const source = await uploadMyData(file);
      setSources((prev) => [source, ...prev.filter((s) => s.id !== tempId)]);
    } catch {
      setSources((prev) => prev.filter((s) => s.id !== tempId));
      setUploadError("Couldn't process that file — try a clearer scan or a different format.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDelete(source: ChatSource) {
    if (!window.confirm(`Delete "${source.title}"? This can't be undone.`)) return;

    setDeleteError(null);
    setDeletingId(source.id);
    try {
      await deleteMyDataSource(source.id);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    } catch {
      setDeleteError("Couldn't delete that document — try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="My Data"
        title="Your records"
        meta={
          sources.length > 0
            ? `${sources.length} document${sources.length === 1 ? "" : "s"}`
            : undefined
        }
        action={
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full bg-teal-deep px-4 py-2 text-[13px] font-medium text-bg-mist transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New
          </button>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="px-5 pb-16 pt-8 sm:px-8">
        {uploadError && (
          <p className="mb-4 text-[13px] text-clay-alert">{uploadError}</p>
        )}
        {deleteError && (
          <p className="mb-4 text-[13px] text-clay-alert">{deleteError}</p>
        )}

        {sources.length > 0 && (
          <div className="mb-5">
            <CategoryFilter value={category} onChange={setCategory} />
          </div>
        )}

        {loadError ? (
          <LoadError
            message="Couldn't load your documents — the backend may be unreachable."
            onRetry={() => setRetryKey((k) => k + 1)}
          />
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-[14px] text-stone">
              No documents yet. Upload a report, lab result, or prescription to get started.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-4 py-2 text-[13px] text-ink/80 transition-colors duration-150 hover:border-teal-deep/60"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Upload your first document
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-stone">
            No documents in this category yet.
          </p>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer(0.06)}
            initial="hidden"
            animate="show"
          >
            {filtered.map((source) => (
              <motion.div key={source.id} variants={item}>
                <DataCard
                  source={source}
                  processing={source.id === processingId}
                  deleting={source.id === deletingId}
                  onClick={() => {
                    if (source.id !== processingId) setOpenSource(source);
                  }}
                  onDelete={() => handleDelete(source)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <SourceModal source={openSource} onClose={() => setOpenSource(null)} />
    </div>
  );
}
