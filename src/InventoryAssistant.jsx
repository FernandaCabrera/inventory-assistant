import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Send,
  Package,
  Lock,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Search,
  RotateCcw,
  Loader2,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  BadgeCheck,
  Home,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import sampleInventory from "./data/inventory.json";
import ExcelJS from "exceljs/dist/exceljs.min.js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { COLORS, STATUS_STYLE, FONT_MONO, FONT_HEAD, FONT_BODY, primaryButton, secondaryButton } from "./theme";
import { LANGS, LOCALES, detectLang, translator, formatNumber, formatMoney } from "./i18n";
import { STATUS_ORDER, statusFor, daysOfCover, tiedUpValue, summarize, toNumber } from "./inventoryLogic";
import { FREE_UPLOADS, FREE_QUESTIONS, EXCESS_RATIO, MAX_ROWS, SHOW_PROMPT, ORDER_COVER_DAYS } from "./config";
import { load, save, remove } from "./storage";
import ImportModal from "./ImportModal";
import UpgradeModal from "./UpgradeModal";
import OrderList from "./OrderList";
import SummaryCards from "./SummaryCards";
import { HomeSections, Footer, PrivacyModal } from "./HomeSections";
import { buildOrderList, runningOutFirst } from "./orderLogic";
import { useIsMobile, KPICard, ChartCard, chipStyle, chipButtonStyle } from "./ui";
import CountImportModal from "./CountImportModal";
import CycleCounts from "./CycleCounts";
import { pickSheet } from "./importLogic";
import { guessCountMapping, validateCountMapping, buildCountLines } from "./countLogic";
import { sampleCountGrid, SAMPLE_COUNT_TOTAL_LOCATIONS, SAMPLE_COUNT_FILE } from "./data/sampleCounts";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4001";

// Most urgent first in lists
const LIST_ORDER = { critical: 0, low: 1, idle: 2, excess: 3, ok: 4 };
const SIDEBAR_LIMIT = 200;

function useGoogleFonts() {
  useEffect(() => {
    if (document.getElementById("ia-fonts")) return;
    const link = document.createElement("link");
    link.id = "ia-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

function GlobalStyles() {
  return (
    <style>{`
      @keyframes ia-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .ia-spin { animation: ia-spin 0.8s linear infinite; }
      @keyframes ia-scan {
        0% { left: 0%; opacity: 1; }
        45% { opacity: 1; }
        50% { left: calc(100% - 3px); opacity: 1; }
        55% { opacity: 0; }
        100% { left: 0%; opacity: 0; }
      }
      .ia-scanline { animation: ia-scan 2.2s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .ia-scanline, .ia-spin { animation: none; }
      }
    `}</style>
  );
}

function BarcodeStrip({ animated = false }) {
  const bars = useMemo(() => Array.from({ length: 60 }, () => Math.random() > 0.5), []);
  return (
    <div style={{ position: "relative", height: 14, overflow: "hidden" }} aria-hidden="true">
      <div style={{ display: "flex", gap: 2, height: 14, alignItems: "stretch", opacity: 0.55 }}>
        {bars.map((wide, i) => (
          <div key={i} style={{ width: wide ? 3 : 1.5, background: COLORS.ink }} />
        ))}
      </div>
      {animated && (
        <div
          className="ia-scanline"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 3,
            height: "100%",
            background: COLORS.critical,
            boxShadow: `0 0 6px ${COLORS.critical}`,
          }}
        />
      )}
    </div>
  );
}

function LanguageToggle({ lang, onChange }) {
  return (
    <div
      role="group"
      aria-label="Language / Idioma"
      style={{ display: "inline-flex", border: `1px solid ${COLORS.ink}`, borderRadius: 6, overflow: "hidden" }}
    >
      {LANGS.map((code) => (
        <button
          key={code}
          onClick={() => onChange(code)}
          aria-pressed={lang === code}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            padding: "6px 11px",
            border: "none",
            background: lang === code ? COLORS.ink : "transparent",
            color: lang === code ? "#F4F1EA" : COLORS.ink,
            cursor: "pointer",
          }}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function StatusStamp({ status, t }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        color: style.color,
        background: style.bg,
        border: `1.5px solid ${style.color}`,
        borderRadius: 4,
        padding: "2px 7px",
        transform: status === "critical" ? "rotate(-2deg)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {t(`status_${status}`)}
    </span>
  );
}

function Dashboard({ items, lang, t }) {
  const isMobile = useIsMobile();
  const summary = useMemo(() => summarize(items), [items]);

  const statusData = STATUS_ORDER.map((status) => ({
    name: t(`statusName_${status}`),
    value: summary.counts[status],
    color: STATUS_STYLE[status].color,
  }));

  const COVER_CHART_LIMIT = 10;
  const allCoverData = items
    .map((item) => ({ sku: item.sku, days: daysOfCover(item), color: STATUS_STYLE[statusFor(item)].color }))
    .filter((d) => d.days !== null)
    .map((d) => ({ ...d, days: Number(d.days.toFixed(1)) }))
    .sort((a, b) => a.days - b.days);
  const coverData = allCoverData.slice(0, COVER_CHART_LIMIT);
  const hiddenCount = allCoverData.length - coverData.length;

  const warehouseData = Object.entries(summary.warehouses).map(([name, value]) => ({ name, value }));
  const warehouseColors = [COLORS.ok, COLORS.low, COLORS.excess, COLORS.critical, COLORS.idle, COLORS.inkMuted];

  const TIED_UP_LIMIT = 8;
  const tiedUpData = items
    .map((item) => ({ sku: item.sku, value: Math.round(tiedUpValue(item)), color: STATUS_STYLE[statusFor(item)].color }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, TIED_UP_LIMIT);

  const axisTick = { fontSize: 11, fill: COLORS.inkMuted };
  const skuTick = { fontSize: 11, fill: COLORS.ink, fontFamily: FONT_MONO };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPICard label={t("kpiTotal")} value={formatNumber(lang, summary.total)} />
        <KPICard label={t("statusName_critical")} value={summary.counts.critical} color={COLORS.critical} />
        <KPICard label={t("statusName_low")} value={summary.counts.low} color={COLORS.low} />
        <KPICard label={t("statusName_idle")} value={summary.counts.idle} color={COLORS.idle} />
        <KPICard label={t("statusName_excess")} value={summary.counts.excess} color={COLORS.excess} />
        <KPICard label={t("kpiUnits")} value={formatNumber(lang, summary.totalUnits)} />
      </div>

      {summary.hasCost ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KPICard label={t("kpiValue")} value={formatMoney(lang, summary.inventoryValue)} />
          <KPICard label={t("kpiTiedUp")} value={formatMoney(lang, summary.tiedUp)} color={COLORS.idle} />
        </div>
      ) : (
        <div style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>{t("noCostNote")}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <ChartCard title={t("chartStatus")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: COLORS.line }} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={34} />
              <Tooltip />
              <Bar dataKey="value" name={t("tooltipSkus")} radius={[4, 4, 0, 0]} maxBarSize={60}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("chartWarehouse")}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={warehouseData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {warehouseData.map((entry, i) => (
                  <Cell key={i} fill={warehouseColors[i % warehouseColors.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatNumber(lang, value)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {coverData.length > 0 && (
        <ChartCard
          title={
            hiddenCount > 0
              ? t("chartCoverTop", { n: COVER_CHART_LIMIT, total: formatNumber(lang, items.length) })
              : t("chartCoverAll")
          }
          height={Math.max(220, coverData.length * 42)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={coverData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={{ stroke: COLORS.line }} tickLine={false} />
              <YAxis type="category" dataKey="sku" tick={skuTick} axisLine={false} tickLine={false} width={86} />
              <Tooltip />
              <Bar dataKey="days" name={t("tooltipDays")} radius={[0, 4, 4, 0]} maxBarSize={22}>
                {coverData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {tiedUpData.length > 0 && (
        <ChartCard title={t("chartTiedUp", { n: tiedUpData.length })} height={Math.max(200, tiedUpData.length * 42)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tiedUpData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} horizontal={false} />
              <XAxis
                type="number"
                tick={axisTick}
                axisLine={{ stroke: COLORS.line }}
                tickLine={false}
                tickFormatter={(v) => formatMoney(lang, v)}
              />
              <YAxis type="category" dataKey="sku" tick={skuTick} axisLine={false} tickLine={false} width={86} />
              <Tooltip formatter={(value) => formatMoney(lang, value)} />
              <Bar dataKey="value" name={t("tooltipValue")} radius={[0, 4, 4, 0]} maxBarSize={22}>
                {tiedUpData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {summary.hasCost && (
        <div style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>{t("tiedUpNote", { ratio: EXCESS_RATIO })}</div>
      )}
    </div>
  );
}

// Free plan with the visitor's own file: the real dashboard is not rendered at all.
// What sits behind the blur is the sample dataset, so nothing of theirs is in the page.
function LockedDashboard({ summary, lang, t, onUnlock }) {
  const teaser =
    summary.hasCost && summary.tiedUpCount > 0
      ? t("lockTeaserMoney", { count: formatNumber(lang, summary.tiedUpCount) })
      : t("lockTeaserStatus", {
          critical: summary.counts.critical,
          low: summary.counts.low,
          notMoving: summary.notMovingCount,
        });

  return (
    <div style={{ position: "relative", minHeight: 420 }}>
      <div
        aria-hidden="true"
        style={{ filter: "blur(7px)", opacity: 0.55, pointerEvents: "none", userSelect: "none", maxHeight: 640, overflow: "hidden" }}
      >
        <Dashboard items={sampleInventory} lang={lang} t={t} />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 48,
        }}
      >
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.ink}`,
            borderRadius: 12,
            padding: "24px 24px 26px",
            maxWidth: 440,
            width: "calc(100% - 28px)",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          <Lock size={22} color={COLORS.ink} />
          <h2
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 22,
              fontWeight: 600,
              textTransform: "uppercase",
              margin: "10px 0 10px",
              color: COLORS.ink,
              lineHeight: 1.2,
            }}
          >
            {t("lockTitle")}
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: COLORS.ink, margin: "0 0 18px" }}>{teaser}</p>
          <button onClick={onUnlock} style={primaryButton}>
            {t("unlock")} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function renderWithBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: COLORS.critical, fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function Message({ role, text, onExport, isExporting, isMobile, t }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 16 }}>
      <div
        style={{
          maxWidth: isMobile ? "94%" : "80%",
          background: isUser ? COLORS.ink : COLORS.surface,
          color: isUser ? "#F4F1EA" : COLORS.ink,
          border: isUser ? "none" : `1px solid ${COLORS.line}`,
          borderRadius: isUser ? "3px 14px 14px 14px" : "14px 14px 14px 3px",
          padding: "13px 16px",
          fontSize: 14.5,
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontFamily: FONT_BODY,
        }}
      >
        {renderWithBold(text)}
        {!isUser && onExport && (
          <button
            onClick={onExport}
            disabled={isExporting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 12,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.06em",
              fontFamily: FONT_MONO,
              padding: "6px 11px",
              borderRadius: 5,
              border: `1px solid ${COLORS.ink}`,
              background: "transparent",
              color: COLORS.ink,
              cursor: isExporting ? "default" : "pointer",
              textTransform: "uppercase",
              opacity: isExporting ? 0.6 : 1,
            }}
          >
            {isExporting ? (
              <>
                <Loader2 size={12} className="ia-spin" /> {t("exporting")}
              </>
            ) : (
              <>
                <Download size={12} /> {t("exportReport")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function playScanBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.12);
  } catch (err) {
    // Audio not available — fail silently, not critical to app function.
  }
}

function WelcomeScreen({ lang, t, onLang, onUpload, onSample, onPrivacy, current, onContinue, onClear, counts, onCountUpload, onCountSample, onCountContinue }) {
  return (
    <div
      style={{
        fontFamily: FONT_BODY,
        background: COLORS.bg,
        minHeight: "100vh",
        padding: "24px 16px 28px",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "absolute", top: 18, right: 18 }}>
        <LanguageToggle lang={lang} onChange={onLang} />
      </div>

      {/* The first screen: what it is and the two ways in */}
      <div
        style={{
          minHeight: "min(84vh, 760px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          paddingBottom: 28,
        }}
      >

      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: COLORS.inkMuted,
          textTransform: "uppercase",
          marginBottom: 14,
          marginTop: 30,
        }}
      >
        {t("brand")}
      </div>

      <h1
        style={{
          fontFamily: FONT_HEAD,
          fontSize: "clamp(34px, 8vw, 64px)",
          fontWeight: 600,
          color: COLORS.ink,
          margin: 0,
          letterSpacing: "0.01em",
          textTransform: "uppercase",
          lineHeight: 1.1,
        }}
      >
        {t("title")}
      </h1>

      <div style={{ margin: "22px 0", maxWidth: 420, width: "100%" }}>
        <BarcodeStrip animated />
      </div>

      <p style={{ fontSize: 15.5, color: COLORS.inkMuted, maxWidth: 470, lineHeight: 1.6, margin: "0 0 28px" }}>{t("tagline")}</p>

      {/* Someone who already loaded a file gets the way back to it first */}
      {current && (
        <button
          onClick={onContinue}
          data-testid="continue"
          style={{ ...primaryButton, padding: "14px 24px", fontSize: 13, marginBottom: 12, maxWidth: "100%" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("continueWith", { name: current.name })}</span>
          <ArrowRight size={15} style={{ flexShrink: 0 }} />
        </button>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => {
            playScanBeep();
            onUpload();
          }}
          style={{ ...(current ? secondaryButton : primaryButton), padding: "14px 24px", fontSize: 13 }}
        >
          <Upload size={15} /> {current && current.isUpload ? t("replaceData") : t("uploadCta")}
        </button>
        <button
          onClick={() => {
            playScanBeep();
            setTimeout(onSample, 150);
          }}
          style={{ ...secondaryButton, padding: "14px 24px", fontSize: 13 }}
        >
          {t("sampleCta")} <ArrowRight size={15} />
        </button>
      </div>

      <p style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: COLORS.ink, letterSpacing: "0.03em", margin: "20px 0 6px" }}>
        {t("freeNote", { uploads: FREE_UPLOADS, questions: FREE_QUESTIONS })}
      </p>
      <p style={{ fontSize: 12.5, color: COLORS.inkMuted, maxWidth: 440, lineHeight: 1.55, margin: 0 }}>{t("privacy")}</p>
      {current && current.isUpload && (
        <button
          onClick={onClear}
          style={{
            marginTop: 14,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12.5,
            color: COLORS.inkMuted,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {t("clearData")}
        </button>
      )}
      </div>

      {/* The second tool: conclusions from a cycle count report */}
      <section
        data-testid="counts-band"
        style={{
          width: "100%",
          maxWidth: 960,
          margin: "0 auto 36px",
          textAlign: "left",
          background: COLORS.surface,
          border: `1px solid ${COLORS.ink}`,
          borderRadius: 12,
          padding: "24px 24px 22px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <ClipboardCheck size={20} color={COLORS.ink} />
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 26, fontWeight: 600, textTransform: "uppercase", color: COLORS.ink, margin: 0, letterSpacing: "0.01em" }}>
            {t("countsTitle")}
          </h2>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#FFFFFF", background: COLORS.critical, borderRadius: 4, padding: "3px 7px" }}>
            {t("countsTag")}
          </span>
        </div>
        <p style={{ fontSize: 15, color: COLORS.ink, lineHeight: 1.6, margin: "0 0 16px", maxWidth: 760 }}>{t("countsBody")}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {counts && (
            <button onClick={onCountContinue} data-testid="counts-continue" style={{ ...primaryButton, padding: "12px 20px", maxWidth: "100%" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("countsBack", { name: counts.fileName })}</span>
              <ArrowRight size={15} style={{ flexShrink: 0 }} />
            </button>
          )}
          <button onClick={onCountUpload} data-testid="counts-upload" style={{ ...(counts ? secondaryButton : primaryButton), padding: "12px 20px" }}>
            <Upload size={15} /> {t("countsUpload")}
          </button>
          <button onClick={onCountSample} data-testid="counts-sample" style={{ ...secondaryButton, padding: "12px 20px" }}>
            {t("countsSample")} <ArrowRight size={15} />
          </button>
        </div>
        <p style={{ display: "flex", gap: 8, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5, margin: 0 }}>
          <ShieldCheck size={15} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 2 }} />
          {t("countsPrivacy")}
        </p>
      </section>

      <HomeSections t={t} onPrivacy={onPrivacy} />
      <Footer t={t} onPrivacy={onPrivacy} />
    </div>
  );
}

function loadStoredDataset() {
  const stored = load("dataset", null);
  if (!stored || !Array.isArray(stored.items) || stored.items.length === 0) return null;
  return stored;
}

// Only complete question/answer pairs go back to the model as context.
function historyForApi(messages) {
  const turns = [];
  for (let i = 0; i < messages.length - 1; i += 1) {
    const q = messages[i];
    const a = messages[i + 1];
    if (q.role === "user" && a.role === "assistant" && !a.local) {
      turns.push({ role: "user", text: q.text }, { role: "assistant", text: a.text });
    }
  }
  return turns.slice(-6);
}

export default function InventoryAssistant() {
  useGoogleFonts();
  const isMobile = useIsMobile();

  const [lang, setLang] = useState(() => {
    const stored = load("lang", null);
    return LANGS.includes(stored) ? stored : detectLang();
  });
  const t = useMemo(() => translator(lang), [lang]);

  const [dataset, setDataset] = useState(loadStoredDataset);
  const [hasEntered, setHasEntered] = useState(() => dataset !== null);
  const [uploadsUsed, setUploadsUsed] = useState(() => Number(load("uploadsUsed", 0)) || 0);
  const [questionsUsed, setQuestionsUsed] = useState(() => Number(load("questionsUsed", 0)) || 0);
  const [accessCode, setAccessCode] = useState(() => String(load("accessCode", "") || ""));
  const paid = accessCode !== "";

  const [messages, setMessages] = useState([{ role: "assistant", greeting: true }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [view, setView] = useState("assistant");
  const [searchQuery, setSearchQuery] = useState("");
  const [exportingIndex, setExportingIndex] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState(null); // null = closed
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [coverDays, setCoverDays] = useState(() => String(load("coverDays", ORDER_COVER_DAYS)));
  // Cycle count report. Kept only while the page is open: it is never saved or sent anywhere.
  const [counts, setCounts] = useState(null);
  const [countInputs, setCountInputs] = useState({ total: "", counted: "", cycle: null });
  const [showCounts, setShowCounts] = useState(false);
  const [showCountImport, setShowCountImport] = useState(false);
  const scrollRef = useRef(null);

  const items = useMemo(() => (dataset ? dataset.items : []), [dataset]);
  const summary = useMemo(() => summarize(items), [items]);
  const isSample = !dataset || dataset.source === "sample";
  const dashboardLocked = !isSample && !paid;
  const orderList = useMemo(() => buildOrderList(items, coverDays), [items, coverDays]);
  const runOut = useMemo(() => runningOutFirst(items, 3), [items]);
  const questionsLeft = paid ? Infinity : Math.max(0, FREE_QUESTIONS - questionsUsed);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === "es" ? "MiKardex · Pregúntale a tu inventario" : "MiKardex · Ask Your Inventory";
  }, [lang]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  // Wake the server as soon as the page opens: on a sleeping host the first request takes about
  // a minute, and this way it is ready by the time the visitor has loaded a file and asks something.
  useEffect(() => {
    fetch(`${API_URL}/api/health`).catch(() => {});
  }, []);

  // A stored code is checked once per visit; a code that was withdrawn stops unlocking.
  useEffect(() => {
    if (!accessCode) return;
    let cancelled = false;
    fetch(`${API_URL}/api/validate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: accessCode }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.valid === false) {
          setAccessCode("");
          remove("accessCode");
        }
      })
      .catch(() => {
        // offline or server asleep: keep the code and try again next visit
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeLang(next) {
    setLang(next);
    save("lang", next);
    // the count example has product names and reasons in the language it was built in
    if (counts && counts.source === "sample") setCounts(sampleCounts(next));
  }

  function greetingText() {
    if (isSample) {
      return t("greetingSample", { n: summary.total, w: summary.warehouseCount });
    }
    const lines = [
      t("greetingUpload", {
        n: formatNumber(lang, summary.total),
        file: dataset.fileName,
        critical: summary.counts.critical,
        low: summary.counts.low,
        idle: summary.counts.idle,
        excess: summary.counts.excess,
      }),
    ];
    const report = dataset.report || {};
    if (report.skippedNoStock > 0) lines.push(t("reportSkippedNoStock", { n: report.skippedNoStock }));
    if (report.negatives > 0) lines.push(t("reportNegatives", { n: report.negatives }));
    if (report.truncated) lines.push(t("reportTruncated", { max: formatNumber(lang, MAX_ROWS) }));
    return lines.join("\n\n");
  }

  function resetConversation() {
    setMessages([{ role: "assistant", greeting: true }]);
    setInput("");
  }

  function loadSampleData() {
    setDataset({ items: sampleInventory, source: "sample", fileName: null, loadedAt: new Date().toISOString() });
    resetConversation();
    setHasEntered(true);
  }

  // Back to the home page. The loaded data stays; the home page offers the way back to it.
  function goHome() {
    setHasEntered(false);
    setShowCounts(false);
    setView("assistant");
    window.scrollTo(0, 0);
  }

  function handleCountsImported(imported) {
    setCounts({ ...imported, source: "upload" });
    setCountInputs({ total: "", counted: "", cycle: null });
    setShowCountImport(false);
    setShowCounts(true);
    window.scrollTo(0, 0);
  }

  // The example goes through the same steps as an uploaded file
  function sampleCounts(language) {
    const picked = pickSheet([{ name: "sample", grid: sampleCountGrid(language) }], { guess: guessCountMapping, validate: validateCountMapping, scanRows: 40 });
    const sheet = picked.candidates[picked.bestIndex];
    const built = buildCountLines(sheet.table, sheet.mapping);
    return { ...built, source: "sample", fileName: SAMPLE_COUNT_FILE[language] };
  }

  function loadSampleCounts() {
    setCounts(sampleCounts(lang));
    setCountInputs({ total: String(SAMPLE_COUNT_TOTAL_LOCATIONS), counted: "", cycle: null });
    setShowCounts(true);
    window.scrollTo(0, 0);
  }

  // What "Continue" on the home page opens: the visitor's own file if there is one, else the sample.
  function continueTarget() {
    if (dataset && dataset.source === "upload") return { name: dataset.fileName, isUpload: true };
    const stored = loadStoredDataset();
    if (stored) return { name: stored.fileName, isUpload: true };
    if (dataset) return { name: t("sampleData"), isUpload: false };
    return null;
  }

  function continueToData() {
    if (dataset && dataset.source === "upload") {
      setHasEntered(true); // same data, same conversation
      return;
    }
    const stored = loadStoredDataset();
    if (stored) {
      // they were looking at the sample: bring their own file back
      setDataset(stored);
      resetConversation();
    }
    if (stored || dataset) setHasEntered(true);
  }

  function clearData() {
    if (!window.confirm(t("clearConfirm"))) return;
    remove("dataset");
    setDataset(null);
    setSearchQuery("");
    resetConversation();
  }

  function requestUpload() {
    if (!paid && uploadsUsed >= FREE_UPLOADS) {
      setUpgradeReason("upload");
      return;
    }
    setShowImport(true);
  }

  function handleImported({ items: imported, fileName, report }) {
    const next = { items: imported, source: "upload", fileName, report, loadedAt: new Date().toISOString() };
    setDataset(next);
    save("dataset", next);
    const used = uploadsUsed + 1;
    setUploadsUsed(used);
    save("uploadsUsed", used);
    setShowImport(false);
    setSearchQuery("");
    setView("assistant");
    resetConversation();
    setHasEntered(true);
  }

  const closeImport = useCallback(() => setShowImport(false), []);
  const openCountImport = useCallback(() => setShowCountImport(true), []);
  const closeCountImport = useCallback(() => setShowCountImport(false), []);
  const closeUpgrade = useCallback(() => setUpgradeReason(null), []);
  const openPrivacy = useCallback(() => setShowPrivacy(true), []);
  const closePrivacy = useCallback(() => setShowPrivacy(false), []);

  function changeCoverDays(value) {
    setCoverDays(value);
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 365) save("coverDays", Math.round(n));
  }

  function handleActivated(code) {
    const clean = code.trim().toUpperCase();
    setAccessCode(clean);
    save("accessCode", clean);
  }

  async function toggleShowPrompt() {
    if (!showPrompt && !systemPrompt) {
      try {
        const res = await fetch(`${API_URL}/api/system-prompt`);
        const data = await res.json();
        setSystemPrompt(data.prompt);
      } catch (err) {
        setSystemPrompt(t("promptError"));
      }
    }
    setShowPrompt((s) => !s);
  }

  async function exportReport(text, actionItems = [], index = null) {
    setExportingIndex(index);
    const startTime = Date.now();
    const clean = text.replace(/\*\*/g, "");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MiKardex";
    workbook.created = new Date();

    const statusColors = {
      critical: "FFC1431F",
      low: "FFB8862E",
      ok: "FF2E6F4E",
      idle: "FF6B4E8C",
      excess: "FF3A5A8C",
    };
    const priorityColors = {
      High: "FFC1431F",
      Medium: "FFB8862E",
      Low: "FF2E6F4E",
      None: "FF9AA096",
    };
    const darkHeader = (row) => {
      row.font = { bold: true, color: { argb: "FFFFFFFF" } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15181A" } };
    };

    // Sheet 1: Report narrative
    const report = workbook.addWorksheet(t("xlsReport"));
    report.columns = [{ width: 100 }];
    const titleRow = report.addRow([t("xlsTitle")]);
    titleRow.font = { bold: true, size: 16, color: { argb: "FF15181A" } };
    report.addRow([new Date().toLocaleString(LOCALES[lang])]).font = { italic: true, color: { argb: "FF6B7268" } };
    report.addRow([]);
    clean
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        const row = report.addRow([line]);
        row.alignment = { wrapText: true, vertical: "top" };
        row.font = { size: 11, color: { argb: "FF15181A" } };
      });
    report.addRow([]);
    report.addRow([t("xlsFooter")]).font = { italic: true, size: 10, color: { argb: "FF6B7268" } };

    // Sheet 2: Action Plan — real columns, built from the model's structured output
    if (actionItems.length > 0) {
      const plan = workbook.addWorksheet(t("xlsPlan"));
      plan.columns = [
        { header: "SKU", key: "sku", width: 14 },
        { header: t("xlsIssue"), key: "issue", width: 40 },
        { header: t("xlsAction"), key: "action", width: 40 },
        { header: t("xlsPriority"), key: "priority", width: 16 },
      ];
      darkHeader(plan.getRow(1));
      plan.views = [{ state: "frozen", ySplit: 1 }];

      actionItems.forEach((item) => {
        const priority = priorityColors[item.priority] ? item.priority : "None";
        const row = plan.addRow({
          sku: item.sku || "—",
          issue: item.issue || "",
          action: item.recommended_action || "",
          priority: t(`priority_${priority}`),
        });
        row.getCell("issue").alignment = { wrapText: true, vertical: "top" };
        row.getCell("action").alignment = { wrapText: true, vertical: "top" };
        const priorityCell = row.getCell("priority");
        priorityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: priorityColors[priority] } };
        priorityCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        priorityCell.alignment = { horizontal: "center" };
        row.eachCell((cell) => {
          cell.border = { bottom: { style: "hair", color: { argb: "FFDADFD7" } } };
        });
      });
    }

    // Sheet 3: Full inventory snapshot
    const sheet = workbook.addWorksheet(t("xlsSnapshot"));
    const columns = [
      { header: "SKU", key: "sku", width: 14 },
      { header: t("xlsName"), key: "name", width: 32 },
      { header: t("xlsWarehouse"), key: "warehouse", width: 16 },
      { header: t("xlsStock"), key: "stock", width: 10 },
      { header: t("xlsReorder"), key: "reorder", width: 17 },
      { header: t("xlsLead"), key: "lead", width: 18 },
      { header: t("xlsUsage"), key: "usage", width: 16 },
      { header: t("xlsCover"), key: "cover", width: 17 },
    ];
    if (summary.hasCost) {
      columns.push({ header: t("xlsCost"), key: "cost", width: 14 }, { header: t("xlsValue"), key: "value", width: 16 });
    }
    columns.push({ header: t("xlsStatus"), key: "status", width: 14 });
    sheet.columns = columns;
    darkHeader(sheet.getRow(1));
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    items.forEach((item) => {
      const status = statusFor(item);
      const cover = daysOfCover(item);
      const cost = toNumber(item.unit_cost);
      const row = sheet.addRow({
        sku: item.sku,
        name: item.name,
        warehouse: item.warehouse,
        stock: item.stock,
        reorder: item.reorder_point ?? "",
        lead: item.lead_time_days ?? "",
        usage: item.avg_daily_usage ?? "",
        cover: cover === null ? "" : Number(cover.toFixed(1)),
        cost: cost ?? "",
        value: cost === null ? "" : Math.round(item.stock * cost),
        status: t(`status_${status}`),
      });
      const statusCell = row.getCell("status");
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusColors[status] } };
      statusCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      statusCell.alignment = { horizontal: "center" };
      row.eachCell((cell) => {
        cell.border = { bottom: { style: "hair", color: { argb: "FFDADFD7" } } };
      });
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("xlsFile")}-${dateStamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    const elapsed = Date.now() - startTime;
    const minDuration = 500;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }
    setExportingIndex(null);
  }

  async function send(promptText) {
    const text = (promptText ?? input).trim();
    if (!text || typing) return;
    if (questionsLeft <= 0) {
      setUpgradeReason("questions");
      return;
    }
    const history = historyForApi(messages);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);

    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, inventory: items, history, code: accessCode || undefined }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const key = data.scope === "plan" ? "limitPlan" : data.scope === "global" ? "limitGlobal" : "limitFree";
        setMessages((m) => [...m, { role: "assistant", text: t(key), local: true }]);
      } else if (!res.ok || typeof data.answer !== "string") {
        setMessages((m) => [...m, { role: "assistant", text: t("errAnswer"), local: true }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: data.answer, actionItems: data.actionItems || [] }]);
        if (!paid) {
          const used = questionsUsed + 1;
          setQuestionsUsed(used);
          save("questionsUsed", used);
        }
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: t("errBackend"), local: true }]);
    } finally {
      setTyping(false);
    }
  }

  const modals = (
    <>
      {showImport && <ImportModal lang={lang} t={t} onClose={closeImport} onImported={handleImported} />}
      {showCountImport && <CountImportModal lang={lang} t={t} onClose={closeCountImport} onImported={handleCountsImported} />}
      {upgradeReason !== null && (
        <UpgradeModal
          t={t}
          lang={lang}
          reason={upgradeReason}
          apiUrl={API_URL}
          skuCount={isSample ? 0 : summary.total}
          onClose={closeUpgrade}
          onActivated={handleActivated}
        />
      )}
      {showPrivacy && <PrivacyModal t={t} onClose={closePrivacy} />}
    </>
  );

  const header = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{ minWidth: 0, cursor: "pointer" }}
          onClick={goHome}
          role="link"
          tabIndex={0}
          title={t("home")}
          onKeyDown={(e) => {
            if (e.key === "Enter") goHome();
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.16em",
              color: COLORS.inkMuted,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {t("brand")}
          </div>
          <h1
            style={{
              fontFamily: FONT_HEAD,
              fontSize: isMobile ? 24 : 34,
              fontWeight: 600,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: "0.01em",
              textTransform: "uppercase",
            }}
          >
            {t("title")}
          </h1>
        </div>
        <div style={{ flexShrink: 0 }}>
          <LanguageToggle lang={lang} onChange={changeLang} />
        </div>
      </div>

      <div style={{ margin: "16px 0 18px" }}>
        <BarcodeStrip />
      </div>
    </>
  );
  const pageStyle = { fontFamily: FONT_BODY, background: COLORS.bg, minHeight: "100vh", padding: isMobile ? "20px 14px" : "36px 20px" };

  if (showCounts && counts) {
    return (
      <div style={pageStyle}>
        <GlobalStyles />
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {header}
          <CycleCounts
            data={counts}
            inputs={countInputs}
            onInputs={setCountInputs}
            lang={lang}
            t={t}
            paid={paid}
            onHome={goHome}
            onReplace={openCountImport}
            onUpgrade={setUpgradeReason}
          />
          <Footer t={t} onPrivacy={openPrivacy} />
        </div>
        {modals}
      </div>
    );
  }

  if (!hasEntered) {
    return (
      <>
        <GlobalStyles />
        <WelcomeScreen
          lang={lang}
          t={t}
          onLang={changeLang}
          onUpload={requestUpload}
          onSample={loadSampleData}
          onPrivacy={openPrivacy}
          current={continueTarget()}
          onContinue={continueToData}
          onClear={clearData}
          counts={counts}
          onCountUpload={openCountImport}
          onCountSample={loadSampleCounts}
          onCountContinue={() => {
            setShowCounts(true);
            window.scrollTo(0, 0);
          }}
        />
        {modals}
      </>
    );
  }

  const query = searchQuery.trim().toLowerCase();
  const matches = items
    .map((item, index) => ({ item, index, status: statusFor(item) }))
    .filter(({ item }) => {
      if (!query) return true;
      return String(item.sku).toLowerCase().includes(query) || String(item.name).toLowerCase().includes(query);
    })
    .sort((a, b) => LIST_ORDER[a.status] - LIST_ORDER[b.status] || a.index - b.index);
  const visible = matches.slice(0, SIDEBAR_LIMIT);

  const loadedDate = dataset && dataset.loadedAt ? new Date(dataset.loadedAt) : new Date();
  const loadedLabel = loadedDate.toLocaleString(LOCALES[lang], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div style={pageStyle}>
      <GlobalStyles />
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {header}

        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${COLORS.line}` }}>
          {[
            { key: "assistant", label: t("tabAssistant") },
            { key: "orders", label: t("tabOrders"), count: orderList.rows.length },
            { key: "dashboard", label: t("tabDashboard") },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "9px 16px",
                border: "none",
                borderBottom: view === tab.key ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                background: "none",
                color: view === tab.key ? COLORS.ink : COLORS.inkMuted,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    background: COLORS.critical,
                    color: "#FFFFFF",
                    borderRadius: 9,
                    padding: "1px 7px",
                    letterSpacing: 0,
                  }}
                >
                  {tab.count}
                </span>
              )}
              {tab.key === "dashboard" && dashboardLocked && <Lock size={11} />}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
          <button onClick={goHome} style={chipButtonStyle} data-testid="home">
            <Home size={11} /> {t("home")}
          </button>
          <span style={chipStyle}>
            <FileSpreadsheet size={11} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
              {isSample ? t("sampleData") : dataset.fileName}
            </span>
          </span>
          <span style={chipStyle}>
            <Clock size={11} /> {t("loadedAt", { time: loadedLabel })}
          </span>
          <span style={chipStyle}>
            <Lock size={11} /> {t("readOnly")}
          </span>
          {paid ? (
            <span style={{ ...chipStyle, color: COLORS.ok, borderColor: COLORS.ok, background: COLORS.okBg, fontWeight: 600 }}>
              <BadgeCheck size={11} /> {t("planActive")}
            </span>
          ) : (
            <button onClick={() => setUpgradeReason("")} style={chipButtonStyle}>
              {t("planFree")}
            </button>
          )}
          <button onClick={requestUpload} style={{ ...chipButtonStyle, background: COLORS.ink, color: "#F4F1EA" }}>
            <Upload size={11} /> {isSample ? t("uploadExcel") : t("replaceData")}
          </button>
          {SHOW_PROMPT && (
            <button onClick={toggleShowPrompt} style={chipButtonStyle}>
              {showPrompt ? <EyeOff size={11} /> : <Eye size={11} />} {showPrompt ? t("hidePrompt") : t("viewPrompt")}
            </button>
          )}
          <button onClick={resetConversation} style={{ ...chipButtonStyle, color: COLORS.inkMuted, border: `1px solid ${COLORS.line}` }}>
            <RotateCcw size={11} /> {t("newConversation")}
          </button>
        </div>

        {SHOW_PROMPT && showPrompt && (
          <pre
            style={{
              background: COLORS.ink,
              color: "#D9DED4",
              fontSize: 11.5,
              lineHeight: 1.6,
              padding: 18,
              borderRadius: 8,
              marginBottom: 20,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              fontFamily: FONT_MONO,
            }}
          >
            {systemPrompt || t("promptLoading")}
          </pre>
        )}

        {view === "orders" ? (
          <>
            {isSample && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 16,
                  fontSize: 13.5,
                  color: COLORS.ink,
                }}
              >
                {t("sampleBanner")}
                <button onClick={requestUpload} style={{ ...primaryButton, padding: "8px 14px", fontSize: 11.5 }}>
                  <Upload size={13} /> {t("uploadExcel")}
                </button>
              </div>
            )}
            <OrderList
              list={orderList}
              lang={lang}
              t={t}
              locked={dashboardLocked}
              coverDays={coverDays}
              onCoverDays={changeCoverDays}
              onUnlock={() => setUpgradeReason("orders")}
            />
          </>
        ) : view === "dashboard" ? (
          dashboardLocked ? (
            <LockedDashboard summary={summary} lang={lang} t={t} onUnlock={() => setUpgradeReason("dashboard")} />
          ) : (
            <>
              {isSample && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 10,
                    padding: "12px 16px",
                    marginBottom: 16,
                    fontSize: 13.5,
                    color: COLORS.ink,
                  }}
                >
                  {t("sampleBanner")}
                  <button onClick={requestUpload} style={{ ...primaryButton, padding: "8px 14px", fontSize: 11.5 }}>
                    <Upload size={13} /> {t("uploadExcel")}
                  </button>
                </div>
              )}
              <Dashboard items={items} lang={lang} t={t} />
            </>
          )
        ) : (
          <>
          <SummaryCards
            runOut={runOut}
            orders={orderList}
            summary={summary}
            moneyVisible={!dashboardLocked}
            lang={lang}
            t={t}
            onOpenOrders={() => setView("orders")}
            onOpenDashboard={() => setView("dashboard")}
          />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 320px", gap: 20 }}>
            {/* Chat panel */}
            <div
              style={{
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                height: isMobile ? 480 : 560,
                minWidth: 0,
              }}
            >
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 20px 4px" }}>
                {messages.map((m, i) => (
                  <Message
                    key={i}
                    role={m.role}
                    text={m.greeting ? greetingText() : m.text}
                    isMobile={isMobile}
                    isExporting={exportingIndex === i}
                    t={t}
                    onExport={
                      m.role === "assistant" && !m.greeting && !m.local
                        ? () => exportReport(m.text, m.actionItems || [], i)
                        : null
                    }
                  />
                ))}
                {typing && (
                  <div style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: "0.04em", color: COLORS.inkMuted, padding: "4px 4px 10px" }}>
                    {t("processing")}
                  </div>
                )}
              </div>

              {messages.length <= 1 && questionsLeft > 0 && (
                <div style={{ padding: "14px 20px 0", display: "flex", flexWrap: "wrap", gap: 7, borderTop: `1px solid ${COLORS.line}` }}>
                  {t("quickPrompts").map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: 12.5,
                        padding: "7px 12px",
                        borderRadius: 20,
                        border: `1px solid ${COLORS.line}`,
                        background: COLORS.surface,
                        color: COLORS.ink,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {q}
                    </button>
                  ))}
                  <button
                    onClick={() => send(t("fullReportPrompt"))}
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 11.5,
                      fontWeight: 600,
                      letterSpacing: "0.03em",
                      padding: "7px 13px",
                      borderRadius: 20,
                      border: `1px solid ${COLORS.ink}`,
                      background: COLORS.ink,
                      color: "#F4F1EA",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <FileText size={12} /> {t("generateReport")}
                  </button>
                </div>
              )}

              {questionsLeft <= 0 ? (
                <div
                  style={{
                    margin: 16,
                    padding: "12px 14px",
                    border: `1px solid ${COLORS.ink}`,
                    borderRadius: 8,
                    background: COLORS.surface,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    fontSize: 14,
                    color: COLORS.ink,
                  }}
                >
                  {t("freeUsedUp", { max: FREE_QUESTIONS })}
                  <button onClick={() => setUpgradeReason("questions")} style={{ ...primaryButton, padding: "9px 14px", fontSize: 11.5 }}>
                    {t("seePlan")} <ArrowRight size={13} />
                  </button>
                </div>
              ) : (
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && send()}
                      placeholder={t("askPlaceholder")}
                      aria-label={t("askPlaceholder")}
                      maxLength={1000}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: FONT_BODY,
                        fontSize: 14,
                        padding: "11px 14px",
                        borderRadius: 8,
                        border: `1px solid ${COLORS.line}`,
                        outline: "none",
                        background: COLORS.surface,
                      }}
                    />
                    <button
                      onClick={() => send()}
                      disabled={typing}
                      aria-label={t("askPlaceholder")}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 8,
                        border: "none",
                        background: COLORS.ink,
                        color: "#F4F1EA",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: typing ? "default" : "pointer",
                        opacity: typing ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                  {!paid && (
                    <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: COLORS.inkMuted, letterSpacing: "0.03em", marginTop: 8 }}>
                      {t("freeCounter", { used: questionsUsed, max: FREE_QUESTIONS })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div
              style={{
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 12,
                padding: 18,
                height: isMobile ? 340 : 560,
                overflowY: "auto",
                boxSizing: "border-box",
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <Package size={15} color={COLORS.ink} />
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: COLORS.ink,
                    textTransform: "uppercase",
                  }}
                >
                  {t("currentInventory")} · {formatNumber(lang, items.length)}
                </span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <BarcodeStrip />
              </div>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <Search size={13} color={COLORS.inkMuted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontFamily: FONT_BODY,
                    fontSize: 12.5,
                    padding: "8px 10px 8px 30px",
                    borderRadius: 6,
                    border: `1px solid ${COLORS.line}`,
                    outline: "none",
                    background: COLORS.surface,
                  }}
                />
              </div>
              {visible.length === 0 && <div style={{ fontSize: 12.5, color: COLORS.inkMuted }}>{t("noMatches")}</div>}
              {visible.map(({ item, index, status }) => (
                <div key={index} style={{ padding: "12px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink, lineHeight: 1.3, overflowWrap: "anywhere" }}>
                      {item.name}
                    </div>
                    <StatusStamp status={status} t={t} />
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: COLORS.inkMuted, letterSpacing: "0.03em", overflowWrap: "anywhere" }}>
                    {item.sku} · {item.warehouse}
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: COLORS.ink, marginTop: 4 }}>
                    {t("stockLine", {
                      stock: formatNumber(lang, item.stock, 2),
                      reorder: item.reorder_point === null || item.reorder_point === undefined ? "—" : formatNumber(lang, item.reorder_point, 2),
                    })}
                  </div>
                </div>
              ))}
              {matches.length > visible.length && (
                <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: COLORS.inkMuted, padding: "12px 0 0" }}>
                  + {formatNumber(lang, matches.length - visible.length)}
                </div>
              )}
            </div>
          </div>
          </>
        )}
        <Footer t={t} onPrivacy={openPrivacy} />
      </div>
      {modals}
    </div>
  );
}
