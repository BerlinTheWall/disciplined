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
  `radial-gradient(60% 50% at 12% 6%, ${a}, transparent 72%),` +
  `radial-gradient(60% 50% at 88% 94%, ${b}, transparent 72%),` +
  `var(--surface)`;

export const BACKGROUNDS: BackgroundPreset[] = [
  {
    key: "warm",
    label: "Warm",
    swatch: "linear-gradient(135deg, #fbe1d9, #e4dff6)",
    light: wash("rgba(250, 224, 216, 0.45)", "rgba(227, 223, 246, 0.48)"),
    dark: wash("rgba(122, 98, 90, 0.20)", "rgba(98, 94, 130, 0.22)"),
  },
  {
    key: "cool",
    label: "Cool",
    swatch: "linear-gradient(135deg, #cfe0f4, #d0f0e8)",
    light: wash("rgba(203, 224, 245, 0.5)", "rgba(205, 238, 231, 0.48)"),
    dark: wash("rgba(78, 100, 132, 0.22)", "rgba(74, 116, 116, 0.2)"),
  },
  {
    key: "mist",
    label: "Mist",
    swatch: "linear-gradient(135deg, #e6e7ee, #ece7ec)",
    light: wash("rgba(228, 230, 238, 0.55)", "rgba(234, 230, 236, 0.5)"),
    dark: wash("rgba(120, 124, 140, 0.16)", "rgba(110, 114, 132, 0.16)"),
  },
];

export const DEFAULT_BACKGROUND: BackgroundKey = "warm";
