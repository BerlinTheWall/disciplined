// Ambient background presets for the app. Each is a subtle two-corner wash that
// spreads gently across the whole screen, with a dialled-down variant for dark
// mode. `swatch` is a small preview used by the Settings picker.

export type BackgroundKey = "warm" | "cool" | "mist";

export interface BackgroundPreset {
  key: BackgroundKey;
  label: string;
  swatch: string;
  light: string;
  dark: string;
}

const wash = (a: string, b: string) =>
  `radial-gradient(130% 90% at 50% 0%, ${a}, transparent 88%),` +
  `radial-gradient(100% 85% at 90% 98%, ${b}, transparent 90%),` +
  `var(--surface)`;

export const BACKGROUNDS: BackgroundPreset[] = [
  {
    key: "warm",
    label: "Warm",
    swatch: "linear-gradient(135deg, #fbe1d9, #e4dff6)",
    light: wash("rgba(250, 216, 205, 0.42)", "rgba(219, 213, 246, 0.85)"),
    dark: wash("rgba(128, 100, 90, 0.2)", "rgba(102, 96, 140, 0.4)"),
  },
  {
    key: "cool",
    label: "Cool",
    swatch: "linear-gradient(135deg, #cfe0f4, #d0f0e8)",
    light: wash("rgba(188, 216, 245, 0.42)", "rgba(191, 236, 226, 0.82)"),
    dark: wash("rgba(72, 100, 140, 0.2)", "rgba(66, 120, 120, 0.38)"),
  },
  {
    key: "mist",
    label: "Mist",
    swatch: "linear-gradient(135deg, #e6e7ee, #ece7ec)",
    light: wash("rgba(220, 224, 236, 0.45)", "rgba(230, 224, 234, 0.85)"),
    dark: wash("rgba(120, 124, 140, 0.16)", "rgba(110, 114, 132, 0.3)"),
  },
];

export const DEFAULT_BACKGROUND: BackgroundKey = "warm";
