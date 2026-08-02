import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Check, ChevronRight, Flame, LoaderCircle, LogOut, Pencil } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { useChoose } from "@/components/ConfirmDialog";
import { Heatmap, Ring } from "@/components/profile/ProfileCharts";
import ProfileDetailSheet, {
  type ProfileDetailKind,
} from "@/components/profile/ProfileDetailSheet";
import { ApiError } from "@/lib/api";
import { fileToAvatar } from "@/lib/avatar";
import { ICONS } from "@/lib/icons";
import { habitStats, heatmapWeeks, recentScores } from "@/lib/insights";
import { tap } from "@/lib/motion";
import { useAuthStore } from "@/store/authStore";
import { useHabitStore } from "@/store/habitStore";
import { useProfileStore } from "@/store/profileStore";
import { useTaskStore } from "@/store/taskStore";

const ACCENT = "#9ec06a"; // the app's soft-green progress accent

// ── Small shared pieces ──────────────────────────────────────────────────────

// Every card doubles as a button into its full-detail sheet (ProfileDetailSheet)
// when `onClick` is given — a chevron marks it as tappable so it doesn't read
// as a dead-end showcase.
function Card({
  title,
  action,
  onClick,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          {onClick && <ChevronRight size={16} className="text-fg-faint" />}
        </div>
      </div>
      {children}
    </>
  );
  if (!onClick) {
    return <section className="rounded-3xl bg-surface border border-border p-5">{content}</section>;
  }
  return (
    <motion.button
      onClick={onClick}
      whileTap={tap}
      className="w-full rounded-3xl bg-surface border border-border p-5 text-left"
    >
      {content}
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const [tagline, avatar, setTagline, setAvatar] = useProfileStore(
    useShallow((state) => [state.tagline, state.avatar, state.setTagline, state.setAvatar])
  );
  const choose = useChoose();
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Tap the avatar to set a photo; with one already set, offer replace/remove.
  async function onAvatarTap() {
    if (avatar) {
      const action = await choose({
        title: "Profile photo",
        options: [
          { label: "Choose a new photo", value: "change" },
          { label: "Remove photo", value: "remove", destructive: true },
        ],
      });
      if (action === "remove") {
        setAvatar(null);
        return;
      }
      if (action !== "change") return;
    }
    avatarFileRef.current?.click();
  }

  async function onAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    try {
      // Downscaled + center-cropped to a small square, so even a huge camera
      // photo stores as a few dozen KB.
      setAvatar(await fileToAvatar(file));
    } catch (err) {
      console.warn("avatar import failed", err);
    }
  }
  const account = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  const name = account?.displayName ?? "";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Which card's full-detail sheet is open — every showcase card below opens
  // one (see ProfileDetailSheet: month-over-month charts + a written summary).
  const [detail, setDetail] = useState<ProfileDetailKind | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [draftTagline, setDraftTagline] = useState(tagline);

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const scores7 = useMemo(() => recentScores(7, tasks, habits), [tasks, habits]);
  const weekDone = scores7.reduce((a, d) => a + d.done, 0);
  const weekTotal = scores7.reduce((a, d) => a + d.total, 0);
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const heat = useMemo(() => heatmapWeeks(13, tasks, habits), [tasks, habits]);

  const habitRows = useMemo(() => habitStats(habits), [habits]);

  async function saveProfile() {
    const trimmedName = draftName.trim();
    setTagline(draftTagline.trim());
    if (trimmedName === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateDisplayName(trimmedName || "You");
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save your name. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Profile header */}
      <section className="rounded-3xl bg-surface border border-border p-5">
        <div className="flex items-center gap-4">
          <motion.button
            onClick={() => void onAvatarTap()}
            whileTap={tap}
            aria-label="Change profile photo"
            className="relative w-16 h-16 rounded-full bg-fg flex items-center justify-center shrink-0"
          >
            {avatar ? (
              <img src={avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-fg-inverse">{initial}</span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-surface border border-border-strong flex items-center justify-center text-fg-muted">
              <Camera size={13} />
            </span>
          </motion.button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onAvatarPicked(e)}
          />
          {editing ? (
            <div className="flex-1 space-y-2">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Your name"
                disabled={saving}
                className="w-full bg-surface-subtle rounded-xl px-3 py-2 text-fg font-semibold outline-none disabled:opacity-60"
              />
              <input
                value={draftTagline}
                onChange={(e) => setDraftTagline(e.target.value)}
                placeholder="A short tagline"
                disabled={saving}
                className="w-full bg-surface-subtle rounded-xl px-3 py-2 text-sm text-fg-muted outline-none disabled:opacity-60"
              />
              {saveError && <p className="text-xs text-red-400 px-1">{saveError}</p>}
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-fg truncate">{name}</p>
              <p className="text-sm text-fg-faint truncate">{tagline}</p>
            </div>
          )}
          {editing ? (
            <motion.button
              whileTap={tap}
              onClick={() => void saveProfile()}
              disabled={saving}
              className="w-10 h-10 rounded-full bg-fg text-fg-inverse flex items-center justify-center shrink-0 disabled:opacity-60"
              aria-label="Save profile"
            >
              {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={18} />}
            </motion.button>
          ) : (
            <motion.button
              whileTap={tap}
              onClick={() => {
                setDraftName(name);
                setDraftTagline(tagline);
                setSaveError(null);
                setEditing(true);
              }}
              className="w-10 h-10 rounded-full bg-surface-subtle text-fg-muted flex items-center justify-center shrink-0"
              aria-label="Edit profile"
            >
              <Pencil size={16} />
            </motion.button>
          )}
        </div>
      </section>

      {/* This week */}
      <Card title="This week" onClick={() => setDetail("consistency")}>
        <div className="flex items-center gap-5">
          <Ring percent={weekPct} />
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-2xl font-bold text-fg tabular-nums leading-none">
                {weekDone}
                <span className="text-base font-medium text-fg-faint">/{weekTotal}</span>
              </p>
              <p className="text-xs text-fg-muted mt-1">commitments completed (last 7 days)</p>
            </div>
            <div className="flex gap-2">
              {scores7.map((d) => {
                const pct = d.total ? (d.score ?? 0) : 0;
                return (
                  <div key={d.date} className="flex-1">
                    <div className="h-12 rounded-md bg-surface-subtle flex items-end overflow-hidden">
                      <div
                        className="w-full rounded-md"
                        style={{
                          height: `${d.total ? Math.max(pct * 100, 8) : 0}%`,
                          backgroundColor: ACCENT,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-center text-fg-faint mt-1">
                      {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "narrow",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Consistency heatmap */}
      <Card title="Consistency" onClick={() => setDetail("consistency")}>
        <Heatmap weeks={heat} />
        <div className="flex items-center justify-end gap-1.5 mt-3 text-[11px] text-fg-faint">
          <span>Less</span>
          {[0.15, 0.4, 0.6, 0.8, 1].map((a) => (
            <span
              key={a}
              className="w-[11px] h-[11px] rounded-[3px]"
              style={{ backgroundColor: `rgba(158,192,106,${a})` }}
            />
          ))}
          <span>More</span>
        </div>
      </Card>

      {/* Habits */}
      {habitRows.length > 0 && (
        <Card title="Habit streaks" onClick={() => setDetail("habits")}>
          <div className="space-y-3">
            {habitRows.map(({ habit, current, longest, rate7 }) => {
              const Icon = ICONS[habit.icon] ?? ICONS.default;
              return (
                <div key={habit.id} className="flex items-center gap-3">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${habit.color}22`, color: habit.color }}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg truncate">{habit.title}</p>
                    <div className="h-1.5 mt-1.5 rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(rate7 * 100)}%`,
                          backgroundColor: habit.color,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="flex items-center gap-1 text-sm font-bold text-fg tabular-nums justify-end">
                      <Flame size={13} className="text-orange-400" />
                      {current}
                    </p>
                    <p className="text-[11px] text-fg-faint">best {longest}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Account */}
      <Card title="Account">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted truncate">{account?.email}</p>
          <motion.button
            whileTap={tap}
            onClick={logout}
            className="flex items-center gap-1.5 shrink-0 rounded-xl bg-surface-subtle px-3 py-2 text-sm font-medium text-red-400"
          >
            <LogOut size={15} />
            Log out
          </motion.button>
        </div>
      </Card>

      <ProfileDetailSheet kind={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
