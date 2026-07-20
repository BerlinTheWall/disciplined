import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Film, Image as ImageIcon, Music, Plus, Trash2, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { useConfirm } from "@/components/ConfirmDialog";
import { useSigmaMediaUrl } from "@/hooks/useSigmaMediaUrl";
import { tap } from "@/lib/motion";
import { deleteSigmaBlob, putSigmaBlob } from "@/lib/sigmaMedia";
import { useSigmaStore, type SigmaMediaItem, type SigmaMediaKind } from "@/store/sigmaStore";

// Upload/edit hub for Sigma Mode's content: the hype lines the fire button and
// periodic barks pull from, plus uploaded videos, photos and audio (voices /
// songs). Everything here is device-local — files live in IndexedDB
// (lib/sigmaMedia.ts), metadata in the sigmaStore.

const MAX_BYTES: Record<SigmaMediaKind, number> = {
  video: 300 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  image: 20 * 1024 * 1024,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide px-1 mb-1.5">
        {title}
      </h3>
      <div className="bg-surface rounded-2xl shadow-soft p-3">{children}</div>
    </section>
  );
}

function MediaRow({ item }: { item: SigmaMediaItem }) {
  const url = useSigmaMediaUrl(item.id);
  const confirm = useConfirm();
  const removeMedia = useSigmaStore((s) => s.removeMedia);

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this file?",
      message: `"${item.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    removeMedia(item.id);
    void deleteSigmaBlob(item.id);
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-alt px-2.5 py-2.5 mb-2 last:mb-0">
      {item.kind === "image" && url && (
        <img src={url} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
      )}
      {item.kind === "video" && url && (
        <video src={url} className="w-11 h-11 rounded-lg object-cover shrink-0" muted />
      )}
      {item.kind === "audio" && (
        <span className="w-11 h-11 rounded-lg bg-surface-raised flex items-center justify-center shrink-0">
          <Music size={18} className="text-fg-muted" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg truncate">{item.name}</p>
        {item.kind === "audio" && url && (
          <audio src={url} controls className="w-full h-8 mt-1" style={{ maxWidth: 220 }} />
        )}
      </div>
      <motion.button
        onClick={() => void handleDelete()}
        whileTap={tap}
        aria-label={`Delete ${item.name}`}
        className="p-2 -m-1 text-fg-faint shrink-0"
      >
        <Trash2 size={16} />
      </motion.button>
    </div>
  );
}

function UploadRow({
  kind,
  label,
  icon: Icon,
}: {
  kind: SigmaMediaKind;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  // Filter outside the selector: a selector that returns a fresh array every
  // call makes useSyncExternalStore see a "changed" value on every render and
  // re-render forever (crashes to a blank screen). Select the raw array,
  // filter it as plain render logic instead.
  const allMedia = useSigmaStore((s) => s.media);
  const media = allMedia.filter((m) => m.kind === kind);
  const addMedia = useSigmaStore((s) => s.addMedia);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      if (file.size > MAX_BYTES[kind]) {
        setError(`${file.name} is too large (max ${Math.round(MAX_BYTES[kind] / 1024 / 1024)}MB)`);
        continue;
      }
      const id = crypto.randomUUID();
      try {
        await putSigmaBlob(id, file);
        addMedia({ id, kind, name: file.name, addedAt: Date.now() });
      } catch (err) {
        console.warn("[sigma] failed to store file", err);
        setError(`Couldn't save ${file.name} — device storage may be full.`);
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="flex items-center gap-1.5 text-[15px] font-medium text-fg">
          <Icon size={15} className="text-fg-muted" />
          {label}
        </p>
        <motion.button
          onClick={() => inputRef.current?.click()}
          whileTap={tap}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-surface-raised text-fg"
        >
          <Plus size={13} />
          Add
        </motion.button>
        <input
          ref={inputRef}
          type="file"
          accept={`${kind}/*`}
          multiple
          className="hidden"
          onChange={(e) => void onFilesPicked(e)}
        />
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {media.length === 0 ? (
        <p className="text-xs text-fg-faint">Nothing uploaded yet.</p>
      ) : (
        media.map((m) => <MediaRow key={m.id} item={m} />)
      )}
    </div>
  );
}

function LinesEditor() {
  const lines = useSigmaStore((s) => s.lines);
  const addLine = useSigmaStore((s) => s.addLine);
  const updateLine = useSigmaStore((s) => s.updateLine);
  const removeLine = useSigmaStore((s) => s.removeLine);
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addLine(trimmed);
    setDraft("");
  }

  return (
    <div>
      <div className="flex flex-col gap-2 mb-3">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={line}
              onChange={(e) => updateLine(i, e.target.value)}
              className="flex-1 min-w-0 bg-surface-alt rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none"
            />
            <motion.button
              onClick={() => removeLine(i)}
              whileTap={tap}
              aria-label="Delete line"
              className="p-2 text-fg-faint shrink-0"
            >
              <X size={16} />
            </motion.button>
          </div>
        ))}
        {lines.length === 0 && (
          <p className="text-xs text-fg-faint">No lines left — add at least one below.</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a new line…"
          className="flex-1 min-w-0 bg-surface-alt rounded-xl px-3 py-2.5 text-sm text-fg placeholder-fg-faint focus:outline-none"
        />
        <motion.button
          onClick={handleAdd}
          whileTap={tap}
          disabled={!draft.trim()}
          aria-label="Add line"
          className="w-9 h-9 rounded-xl bg-fg text-fg-inverse flex items-center justify-center shrink-0 disabled:opacity-40"
        >
          <Plus size={16} />
        </motion.button>
      </div>
    </div>
  );
}

export default function SigmaManager() {
  const isOpen = useSigmaStore((s) => s.managerOpen);
  const closeManager = useSigmaStore((s) => s.closeManager);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={closeManager}
      className="bg-surface-alt max-h-[85vh] flex flex-col"
    >
      <div className="flex items-center justify-between p-5 pb-4">
        <h2 className="text-xl font-bold text-fg">Sigma Content</h2>
        <motion.button onClick={closeManager} whileTap={tap} className="p-2 -m-2 text-fg-faint">
          <X size={22} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <Section title="Hype lines">
          <LinesEditor />
        </Section>
        <Section title="Video">
          <UploadRow kind="video" label="Videos" icon={Film} />
        </Section>
        <Section title="Photos">
          <UploadRow kind="image" label="Photos" icon={ImageIcon} />
        </Section>
        <Section title="Voices & songs">
          <UploadRow kind="audio" label="Audio" icon={Music} />
        </Section>
      </div>
    </BottomSheet>
  );
}
