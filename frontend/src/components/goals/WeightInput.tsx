// A percent-of-parent input: shows what was explicitly set, or the
// auto-split share as a placeholder when it wasn't. Shared by linked
// tasks/goals (against goal.weights), milestones (against m.weight) on the
// detail screen, and AI-suggested milestones (against s.weight) before
// they're even committed — same rule, different owner of the value.
export default function WeightInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | undefined;
  placeholder: number;
  onChange: (weight: number | null) => void;
}) {
  return (
    <div className="flex items-center shrink-0">
      <input
        value={value != null ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          onChange(raw === "" ? null : parseInt(raw, 10));
        }}
        placeholder={String(Math.round(placeholder))}
        inputMode="numeric"
        aria-label="Weight"
        className="w-8 bg-transparent text-right text-xs font-medium tabular-nums text-fg-muted placeholder-fg-muted focus:outline-none"
      />
      <span className="text-xs text-fg-faint">%</span>
    </div>
  );
}
