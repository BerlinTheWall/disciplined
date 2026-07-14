export type Theme = "light" | "dark";

export interface ThemeColors {
  fg: string;
  fgMuted: string;
  fgFaint: string;
  fgInverse: string;
  fgMutedInverse: string;
}

export const themeColors: Record<Theme, ThemeColors> = {
  light: {
    fg: "#111827",
    fgMuted: "#6b7280",
    fgFaint: "#9ca3af",
    fgInverse: "#ffffff",
    fgMutedInverse: "#9ca3af",
  },
  dark: {
    fg: "#f9fafb",
    fgMuted: "#9ca3af",
    fgFaint: "#6b7280",
    fgInverse: "#111827",
    fgMutedInverse: "#6b7280",
  },
};
