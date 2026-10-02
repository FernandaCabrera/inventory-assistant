// Small pieces shared by the inventory screens and the cycle count report.

import { useEffect, useState } from "react";
import { COLORS, FONT_MONO, FONT_HEAD } from "./theme";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= 760 : false);
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 760);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

export function KPICard({ label, value, color, hint }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 10,
        padding: "16px 18px",
        flex: 1,
        minWidth: 124,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: COLORS.inkMuted,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 30, fontWeight: 600, color: color || COLORS.ink, whiteSpace: "nowrap" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export function ChartCard({ title, children, height = 280 }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 10,
        padding: "18px 18px 10px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: COLORS.ink,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

export const chipStyle = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontFamily: FONT_MONO,
  fontSize: 10.5,
  fontWeight: 500,
  letterSpacing: "0.04em",
  color: COLORS.inkMuted,
  background: COLORS.surfaceAlt,
  border: `1px solid ${COLORS.line}`,
  padding: "5px 10px",
  borderRadius: 5,
  textTransform: "uppercase",
  maxWidth: "100%",
};

export const chipButtonStyle = {
  ...chipStyle,
  fontWeight: 600,
  color: COLORS.ink,
  background: "none",
  border: `1px solid ${COLORS.ink}`,
  cursor: "pointer",
};
