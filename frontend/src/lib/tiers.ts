import type { AuthUser, SubscriptionTier } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

// Client-side mirror of backend/app/tiers.py. Server-backed features are
// gated there; this is for device-local features the backend never sees
// (task presets), where the UI is the only place a gate can live.
const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, plus: 1, pro: 2 };
export const TIERS: SubscriptionTier[] = ["free", "plus", "pro"];

// Fails closed: no user, a missing tier (a user cached before the field
// existed, until refreshUser runs), or an unrecognised value all count as free.
export function tierOf(user: AuthUser | null): SubscriptionTier {
  const tier = user?.subscriptionTier;
  // hasOwn, not `in`: `in` also matches inherited keys like "toString".
  return tier && Object.hasOwn(TIER_RANK, tier) ? tier : "free";
}

export function hasTier(user: AuthUser | null, minimum: SubscriptionTier): boolean {
  return TIER_RANK[tierOf(user)] >= TIER_RANK[minimum];
}

// What each plan adds on top of the one below it — shown on the Profile
// page's Subscription card. Keep in step with the require_tier(...) gates in
// backend/app/routers and the client-side gates (PRESETS_MIN_TIER).
export const TIER_INFO: Record<SubscriptionTier, { label: string; color: string; adds: string[] }> =
  {
    free: {
      label: "Free",
      color: "#9ca3af",
      adds: ["Schedule, habits and goals", "Reminders", "Progress insights"],
    },
    plus: {
      label: "Plus",
      color: "#60a5fa",
      adds: [
        "AI assistant chat",
        "Spoken day summary",
        "Google Calendar and Outlook sync",
        "AI help writing goals and milestones",
        "Preset tasks",
      ],
    },
    pro: {
      label: "Pro",
      color: "#eab464",
      adds: ["AI coach check-ins", "Plan My Week", "Smart nudges", "AI goal scheduling"],
    },
  };

export function useHasTier(minimum: SubscriptionTier): boolean {
  return useAuthStore((s) => hasTier(s.user, minimum));
}
