export const COLORS = {
  bg: "#EEF1EC",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F8F5",
  ink: "#15181A",
  inkMuted: "#6B7268",
  line: "#DADFD7",
  critical: "#C1431F",
  criticalBg: "#F7E6DE",
  low: "#B8862E",
  lowBg: "#F5EEDC",
  ok: "#2E6F4E",
  okBg: "#E3EEE6",
  idle: "#6B4E8C",
  idleBg: "#ECE6F2",
  excess: "#3A5A8C",
  excessBg: "#E4E9F2",
};

export const STATUS_STYLE = {
  critical: { color: COLORS.critical, bg: COLORS.criticalBg },
  low: { color: COLORS.low, bg: COLORS.lowBg },
  ok: { color: COLORS.ok, bg: COLORS.okBg },
  idle: { color: COLORS.idle, bg: COLORS.idleBg },
  excess: { color: COLORS.excess, bg: COLORS.excessBg },
};

export const FONT_MONO = "'IBM Plex Mono', monospace";
export const FONT_HEAD = "'Oswald', sans-serif";
export const FONT_BODY = "'Inter', system-ui, sans-serif";

export const monoLabel = {
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export const primaryButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: FONT_MONO,
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  padding: "12px 20px",
  borderRadius: 8,
  border: `1px solid ${COLORS.ink}`,
  background: COLORS.ink,
  color: "#F4F1EA",
  cursor: "pointer",
};

export const secondaryButton = {
  ...primaryButton,
  background: "transparent",
  color: COLORS.ink,
};

export const textInput = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: FONT_BODY,
  fontSize: 14,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${COLORS.line}`,
  outline: "none",
  background: COLORS.surface,
  color: COLORS.ink,
};
