// Chart pieces shared by the cycle count report and the dashboard.

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { COLORS, FONT_MONO } from "./theme";
import { formatNumber } from "./i18n";

// A pair checked for color-blind readers on a white card: blue for surplus or inside the cycle,
// red for shortage or outside it. Single series use the neutral.
export const SURPLUS = "#2F6DB5";
export const SHORTAGE = "#C1431F";
export const NEUTRAL = "#3D4744";

export function ChartLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: COLORS.ink, margin: "-4px 0 10px" }}>
      {items.map((item) => (
        <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// What shows when the pointer is over a bar. Text stays in ink; the swatch carries the color.
export function ChartTip({ active, payload, label, format }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload || {};
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 11px", fontSize: 12, color: COLORS.ink, boxShadow: "0 4px 14px rgba(21, 24, 26, 0.10)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{point.full || label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: "flex", alignItems: "center", gap: 7, lineHeight: 1.7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: point.color || entry.color, flexShrink: 0 }} />
          <span style={{ color: COLORS.inkMuted }}>{entry.name}</span>
          <span style={{ fontFamily: FONT_MONO, marginLeft: "auto", paddingLeft: 14 }}>{format(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export const ZONE_CHART_LIMIT = 12;

// Where to count: one bar per area, the locations outside the cycle first so areas can be compared.
// zones: [{ zone, locations, overdue }]
export function CycleByZoneChart({ zones, lang, t }) {
  const data = [...zones]
    .sort((a, b) => b.overdue - a.overdue || b.locations - a.locations)
    .slice(0, ZONE_CHART_LIMIT)
    .map((z) => ({ name: z.zone || "—", overdue: z.overdue, onTime: z.locations - z.overdue }));
  const longest = data.reduce((max, d) => Math.max(max, d.name.length), 0);
  const num = (value) => formatNumber(lang, value);
  return (
    <div data-testid="count-zone-chart">
      <ChartLegend items={[{ label: t("ccOutside"), color: SHORTAGE }, { label: t("ccWithin"), color: SURPLUS }]} />
      <div style={{ height: Math.max(120, data.length * 34 + 34) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkMuted }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: COLORS.ink, fontFamily: FONT_MONO }} axisLine={false} tickLine={false} width={Math.min(150, 18 + longest * 8)} />
            <Tooltip content={<ChartTip format={num} />} cursor={{ fill: COLORS.surfaceAlt }} />
            <Bar isAnimationActive={false} dataKey="overdue" name={t("ccOutside")} stackId="zone" fill={SHORTAGE} stroke={COLORS.surface} strokeWidth={2} maxBarSize={20} />
            <Bar isAnimationActive={false} dataKey="onTime" name={t("ccWithin")} stackId="zone" fill={SURPLUS} stroke={COLORS.surface} strokeWidth={2} radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
