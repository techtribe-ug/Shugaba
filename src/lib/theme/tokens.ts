/** Design tokens (spec 11.1). White and greys; the Pebble indigo is the one brand colour. */
export const tokens = {
  bg: "#FFFFFF",
  surface: "#F4F4F5",
  line: "#E4E4E7",
  text: "#18181B",
  muted: "#71717A",
  pebble: "#3B358A",
  eye: "#FFFFFF",
  paid: "#16A34A",
  accent: "#0070E0",
  accentHover: "#003087",
  grace: "#B26A00",
  covered: "#1E63B5",
  failed: "#C62828",
  gold: "#B7860B",
  radius: "12px",
} as const;

export type TokenName = keyof typeof tokens;
