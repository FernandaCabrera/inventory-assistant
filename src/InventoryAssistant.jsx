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
  Mail,
} from "lucide-react";
import { sampleInventory } from "./data/sample";
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
import { LANGS, LOCALES, LANG_PATHS, detectLang, translator, formatNumber, formatMoney, countText, fill } from "./i18n";
import { STATUS_ORDER, statusFor, daysOfCover, summarize, toNumber } from "./inventoryLogic";
import { FREE_UPLOADS, FREE_QUESTIONS, EXCESS_RATIO, MAX_ROWS, SHOW_PROMPT, ORDER_COVER_DAYS, CONTACT_EMAIL, OWNER_LINKEDIN } from "./config";
import { load, save, remove } from "./storage";
import ImportModal from "./ImportModal";
import UpgradeModal from "./UpgradeModal";
import PlanModal from "./PlanModal";
import { cleanCode } from "./plan";
import OrderList from "./OrderList";
import SummaryCards from "./SummaryCards";
import { HowItWorks, Plans, AboutAndData, Footer, PrivacyModal } from "./HomeSections";
import LandingPage, { landingVars, bottomLink } from "./LandingPage";
import { landingText } from "./landingText";
import { PAGES, pageFromPath, landingPagesIn } from "./pages";
import { buildOrderList, runningOutFirst } from "./orderLogic";
import { chartData } from "./reportLogic";
import { useReportDownload, ReportCard, DashboardDownload } from "./ReportDownloads";
import { useIsMobile, KPICard, ChartCard, chipStyle, chipButtonStyle } from "./ui";
import CountImportModal from "./CountImportModal";
import CycleCounts from "./CycleCounts";
import CountSnapshot from "./CountSnapshot";
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

// The bars look random but are the same on every load: the home page is also written into the
// HTML when the site is built, and the page React draws on top of it has to look the same.
const BARCODE_BARS = (() => {
  let seed = 2026;
  return Array.from({ length: 60 }, () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 > 0.5;
  });
})();

function BarcodeStrip({ animated = false }) {
  const bars = BARCODE_BARS;
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

// The language links are real links (mikardex.cl/ and mikardex.cl/en/), so Google can follow them.
// A plain click changes the language in place, without reloading and without losing what is loaded;
// with Ctrl, Cmd or the middle button the link opens like any other.
function followLangLink(event, code, onChange) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onChange(code);
}

// paths: where each language lives for the page being shown (the home page when not given)
function LanguageToggle({ lang, onChange, paths = LANG_PATHS }) {
  return (
    <div
      role="group"
      aria-label="Language / Idioma"
      style={{ display: "inline-flex", border: `1px solid ${COLORS.ink}`, borderRadius: 6, overflow: "hidden" }}
    >
      {LANGS.map((code) => (
        <a
          key={code}
          href={paths[code] || LANG_PATHS[code]}
          hrefLang={code}
          onClick={(event) => followLangLink(event, code, onChange)}
          aria-current={lang === code ? "true" : undefined}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            padding: "6px 11px",
            textDecoration: "none",
            background: lang === code ? COLORS.ink : "transparent",
            color: lang === code ? "#F4F1EA" : COLORS.ink,
            cursor: "pointer",
          }}
        >
          {code.toUpperCase()}
        </a>
      ))}
    </div>
  );
}

// The page no longer changes language by itself, so a visitor whose browser is in the other
// language gets a link to it, written in that language. It appears once the page has loaded and
// only for someone who has not chosen a language yet.
function OtherLanguageLink({ lang, onChange }) {
  const [other, setOther] = useState(null);
  useEffect(() => {
    const browser = detectLang();
    setOther(browser !== lang && load("lang", null) === null ? browser : null);
  }, [lang]);
  if (!other) return null;
  return (
    <a
      href={LANG_PATHS[other]}
      hrefLang={other}
      lang={other}
      data-testid="other-language"
      onClick={(event) => followLangLink(event, other, onChange)}
      style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: COLORS.ink, textUnderlineOffset: 3 }}
    >
      {translator(other)("langHint")}
    </a>
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

// children: an extra block shown under the key figures (the cycle counts)
function Dashboard({ items, lang, t, children }) {
  const isMobile = useIsMobile();
  const summary = useMemo(() => summarize(items), [items]);

  const statusData = STATUS_ORDER.map((status) => ({
    name: t(`statusName_${status}`),
    value: summary.counts[status],
    color: STATUS_STYLE[status].color,
  }));

  // The same series go into the PowerPoint download, so the slides show what is on screen
  const charts = useMemo(() => chartData(items, summary), [items, summary]);
  const coverData = charts.cover.map((d) => ({ sku: d.item.sku, days: d.days, color: STATUS_STYLE[d.status].color }));
  const hiddenCount = charts.coverTotal - coverData.length;

  const warehouseData = charts.warehouses.map((row) => ({ name: row.name, value: row.units }));
  const warehouseColors = [COLORS.ok, COLORS.low, COLORS.excess, COLORS.critical, COLORS.idle, COLORS.inkMuted];

  const tiedUpData = charts.tiedUp.map((d) => ({ sku: d.item.sku, value: d.value, color: STATUS_STYLE[d.status].color }));

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

      {children}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <ChartCard title={t("chartStatus")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: COLORS.line }} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={44} />
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
              ? t("chartCoverTop", { n: coverData.length, total: formatNumber(lang, charts.coverTotal) })
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
        <Dashboard items={sampleInventory(lang)} lang={lang} t={t} />
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
                <Download size={12} /> {t("exportAnswer")}
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

// The second tool: conclusions from a cycle count report. Shown on the home page and, while no
// report is loaded, in the cycle count tab. counts is the report loaded in this visit, if any.
// more: the address of the page that explains the report in full (only given on the home page)
function CountsIntro({ t, counts, onUpload, onSample, onContinue, flush = false, more }) {
  return (
    <section
      data-testid="counts-band"
      style={{
        width: "100%",
        maxWidth: 960,
        margin: flush ? 0 : "0 auto 36px",
        textAlign: "left",
        background: COLORS.surface,
        border: `1px solid ${COLORS.ink}`,
        borderRadius: 12,
        padding: "24px 24px 22px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.inkMuted, marginBottom: 8 }}>
        {t("countsEyebrow")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <ClipboardCheck size={20} color={COLORS.ink} />
        <h2 style={{ fontFamily: FONT_HEAD, fontSize: 26, fontWeight: 600, textTransform: "uppercase", color: COLORS.ink, margin: 0, letterSpacing: "0.01em" }}>
          {t("countsTitle")}
        </h2>
      </div>
      <p style={{ fontSize: 15, color: COLORS.ink, lineHeight: 1.6, margin: "0 0 14px", maxWidth: 760 }}>{t("countsBody")}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {t("countsFacts").map((fact) => (
          <div key={fact.h} style={{ flex: "1 1 220px", borderTop: `2px solid ${COLORS.ink}`, paddingTop: 9 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.ink, marginBottom: 4 }}>{fact.h}</div>
            <div style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>{fact.p}</div>
          </div>
        ))}
      </div>
      <CountButtons t={t} counts={counts} onUpload={onUpload} onSample={onSample} onContinue={onContinue} />
      <CountsPrivacy t={t} />
      {more && (
        <a href={more} style={{ ...moreLink, marginTop: 14 }}>
          {t("countsMore")} <ArrowRight size={14} />
        </a>
      )}
    </section>
  );
}

// The ways into the cycle count report: back to the one loaded in this visit, upload one, or the example
function CountButtons({ t, counts, onUpload, onSample, onContinue }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
      {counts && (
        <button onClick={onContinue} data-testid="counts-continue" style={{ ...primaryButton, padding: "12px 20px", maxWidth: "100%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("countsBack", { name: counts.fileName })}</span>
          <ArrowRight size={15} style={{ flexShrink: 0 }} />
        </button>
      )}
      <button onClick={onUpload} data-testid="counts-upload" style={{ ...(counts ? secondaryButton : primaryButton), padding: "12px 20px" }}>
        <Upload size={15} /> {t("countsUpload")}
      </button>
      <button onClick={onSample} data-testid="counts-sample" style={{ ...secondaryButton, padding: "12px 20px" }}>
        {t("countsSample")} <ArrowRight size={15} />
      </button>
    </div>
  );
}

function CountsPrivacy({ t }) {
  return (
    <p style={{ display: "flex", gap: 8, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5, margin: 0 }}>
      <ShieldCheck size={15} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 2 }} />
      {t("countsPrivacy")}
    </p>
  );
}

// Opens the visitor's email with the address and the subject already written
function mailLink(page) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(page.mailSubject)}`;
}

// The button of a page about a service. The line under it shows the address, for whoever
// prefers to copy it, and who is behind the service.
function ContactButton({ t, lang, page }) {
  return (
    <>
      <a
        href={mailLink(page)}
        data-testid="service-mail"
        style={{ ...primaryButton, padding: "14px 24px", fontSize: 13, textDecoration: "none" }}
      >
        <Mail size={15} /> {page.cta}
      </a>
      <p style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.5, margin: "14px 0 0" }}>
        {fill(page.note, landingVars(lang, t))} ·{" "}
        <a href={OWNER_LINKEDIN} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.ink, textUnderlineOffset: 3 }}>
          {t("aboutLinkedin")}
        </a>
      </p>
    </>
  );
}

// A link from a block of the home page to the page that explains it in full
const moreLink = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13.5,
  fontWeight: 600,
  color: COLORS.ink,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

// The ways into the inventory tool: back to the file already loaded, upload one, or the sample data
function StartButtons({ t, current, onContinue, onUpload, onSample }) {
  return (
    <>
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
    </>
  );
}

function WelcomeScreen({ lang, t, onLang, onUpload, onSample, onPrivacy, onPlan, current, onContinue, onClear, counts, onCountUpload, onCountSample, onCountContinue }) {
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
      <div style={{ position: "absolute", top: 18, right: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <OtherLanguageLink lang={lang} onChange={onLang} />
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

      <StartButtons t={t} current={current} onContinue={onContinue} onUpload={onUpload} onSample={onSample} />

      <p style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: COLORS.ink, letterSpacing: "0.03em", margin: "20px 0 6px" }}>
        {t("freeNote", { uploads: countText(t, "uploads", FREE_UPLOADS), questions: FREE_QUESTIONS })}
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

      {/* First the main tool is explained; the cycle count report comes after it, as a second tool */}
      <HowItWorks t={t} more={PAGES.analysis[lang]} />
      <CountsIntro t={t} counts={counts} onUpload={onCountUpload} onSample={onCountSample} onContinue={onCountContinue} more={PAGES.counts[lang]} />
      <Plans t={t} lang={lang} onPlan={onPlan} />
      <AboutAndData t={t} onPrivacy={onPrivacy} service={PAGES.excel[lang] ? { href: PAGES.excel[lang], label: landingText("excel", lang).navLabel } : null} />
      <Footer t={t} onPrivacy={onPrivacy} links={pageLinks(lang, t, "home")} />
    </div>
  );
}

// The links at the bottom of every page: the home page and the pages written for one search each,
// in the language being shown and without the page the visitor is already on.
function pageLinks(lang, t, current) {
  const links = landingPagesIn(lang).map((id) => ({ id, href: PAGES[id][lang], label: landingText(id, lang).navLabel }));
  return [{ id: "home", href: PAGES.home[lang], label: t("home") }, ...links].filter((entry) => entry.id !== current);
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

// path: only given when the site is built, to write each language's home page into the HTML
// (scripts/prerender.js). In the browser the address is read from the address bar.
export default function InventoryAssistant({ path }) {
  useGoogleFonts();
  const isMobile = useIsMobile();

  // The page of the address the visitor arrived at (src/pages.js)
  const [startAt] = useState(() => pageFromPath(path !== undefined ? path : window.location.pathname));
  const [page, setPage] = useState(startAt.id);
  const [lang, setLang] = useState(() => {
    // A page written for one search is in the language of its address.
    if (startAt.id !== "home") return startAt.lang;
    // On the home page a language the visitor chose before comes first; for everyone else the address decides.
    const stored = load("lang", null);
    return LANGS.includes(stored) ? stored : startAt.lang;
  });
  const t = useMemo(() => translator(lang), [lang]);
  // A page that does not exist in the language being shown gives way to the home page
  const shownPage = PAGES[page][lang] ? page : "home";
  const address = PAGES[shownPage][lang];

  const [dataset, setDataset] = useState(loadStoredDataset);
  // Someone with a file already loaded goes straight to the tool, except when they arrive at a
  // page they came to read: the page is shown, with the way back to their file on it.
  const [hasEntered, setHasEntered] = useState(() => dataset !== null && startAt.id === "home");
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
  // A PayPal subscription that was approved but not confirmed with the server yet. It is kept in
  // the browser, so a closed tab or a sleeping server does not lose a payment.
  const pendingPayment = useRef(cleanCode(load("pendingSubscription", "")));
  // The customer's own plan window: null = closed, or "checking" | "active" | "failed" | "error"
  const [planWindow, setPlanWindow] = useState(() => (pendingPayment.current ? "checking" : null));
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
  // The executive report and the dashboard file. With the visitor's own file they are part of the plan.
  const reportDownload = useReportDownload({
    source: {
      items,
      coverDays,
      importInfo: dataset && dataset.source === "upload" ? { ...dataset.report, maxRows: MAX_ROWS } : null,
      sourceName: isSample ? t("sampleData") : dataset.fileName,
    },
    lang,
    t,
    locked: dashboardLocked,
    onUnlock: () => setUpgradeReason("report"),
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = shownPage === "home" ? t("seoTitle") : landingText(shownPage, lang).seoTitle;
    // The address follows the page and the language, so a link copied from the address bar opens the same thing.
    if (window.location.pathname !== address) {
      window.history.replaceState(window.history.state, "", address + window.location.search + window.location.hash);
    }
  }, [lang, t, shownPage, address]);

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
        if (cancelled || !data || data.valid !== false) return;
        // Only the code that was checked is dropped: a new one may have arrived meanwhile
        // (someone who subscribes again gets a new code).
        if (load("accessCode", "") === accessCode) remove("accessCode");
        setAccessCode((current) => (current === accessCode ? "" : current));
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
    // the examples have product names, warehouses and costs in the language they were built in
    if (counts && counts.source === "sample") setCounts(sampleCounts(next));
    if (dataset && dataset.source === "sample") setDataset({ ...dataset, items: sampleInventory(next) });
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
    setDataset({ items: sampleInventory(lang), source: "sample", fileName: null, loadedAt: new Date().toISOString() });
    resetConversation();
    setHasEntered(true);
  }

  // Back to the home page. The loaded data stays; the home page offers the way back to it.
  function goHome() {
    setPage("home");
    setHasEntered(false);
    setShowCounts(false);
    setView("assistant");
    window.scrollTo(0, 0);
  }

  // Opens the count report: as a tab next to the dashboard when an inventory is loaded,
  // on its own when there is none.
  function showCountReport() {
    if (dataset) {
      setHasEntered(true);
      setView("counts");
      setShowCounts(false);
    } else {
      setShowCounts(true);
    }
    window.scrollTo(0, 0);
  }

  function handleCountsImported(imported) {
    setCounts({ ...imported, source: "upload" });
    setCountInputs({ total: "", counted: "", cycle: null });
    setShowCountImport(false);
    showCountReport();
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
    // a two-month cycle, so the example has locations on both sides of it
    setCountInputs({ total: String(SAMPLE_COUNT_TOTAL_LOCATIONS), counted: "", cycle: 60 });
    showCountReport();
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
  const closePlanWindow = useCallback(() => setPlanWindow(null), []);
  const openPrivacy = useCallback(() => setShowPrivacy(true), []);
  const closePrivacy = useCallback(() => setShowPrivacy(false), []);

  function changeCoverDays(value) {
    setCoverDays(value);
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 365) save("coverDays", Math.round(n));
  }

  function handleActivated(code) {
    const clean = cleanCode(code);
    setAccessCode(clean);
    save("accessCode", clean);
  }

  // Asks the server whether the PayPal subscription is active; if it is, its id is the
  // customer's access code. The server may be asleep, so this can take a while and can be retried.
  async function confirmPayment() {
    const subscriptionId = pendingPayment.current;
    if (!subscriptionId) return;
    setPlanWindow("checking");
    try {
      const res = await fetch(`${API_URL}/api/paypal/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid && typeof data.code === "string" && data.code !== "") {
        handleActivated(data.code);
        setPlanWindow("active");
      } else if (res.ok) {
        setPlanWindow("failed"); // PayPal says this subscription is not paid
      } else {
        setPlanWindow("error"); // server or PayPal unavailable: the subscription stays, to try again
        return;
      }
      pendingPayment.current = "";
      remove("pendingSubscription");
    } catch (err) {
      setPlanWindow("error");
    }
  }

  // PayPal's button reports an approved subscription
  function handleSubscribed(subscriptionId) {
    pendingPayment.current = cleanCode(subscriptionId);
    save("pendingSubscription", pendingPayment.current);
    setUpgradeReason(null);
    confirmPayment();
  }

  // a subscription left unconfirmed on an earlier visit is confirmed now
  useEffect(() => {
    confirmPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {showImport && (
        <ImportModal
          lang={lang}
          t={t}
          uploadsLeft={paid ? null : Math.max(0, FREE_UPLOADS - uploadsUsed)}
          uploadsMax={FREE_UPLOADS}
          onClose={closeImport}
          onImported={handleImported}
        />
      )}
      {showCountImport && <CountImportModal lang={lang} t={t} onClose={closeCountImport} onImported={handleCountsImported} />}
      {upgradeReason !== null && (
        <UpgradeModal
          t={t}
          lang={lang}
          reason={upgradeReason}
          apiUrl={API_URL}
          skuCount={isSample ? 0 : summary.total}
          onSubscribed={handleSubscribed}
          onClose={closeUpgrade}
          onActivated={handleActivated}
        />
      )}
      {planWindow !== null && <PlanModal t={t} status={planWindow} code={accessCode} onRetry={confirmPayment} onClose={closePlanWindow} />}
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

  // What a page offers under its heading. The pages about a tool carry that tool's buttons, the
  // same as on the home page; the page about the service carries the button that writes an email.
  function landingButtons(id) {
    if (id === "counts") {
      return {
        actions: <CountButtons t={t} counts={counts} onUpload={openCountImport} onSample={loadSampleCounts} onContinue={showCountReport} />,
        note: <CountsPrivacy t={t} />,
      };
    }
    if (id === "excel") {
      const page = landingText(id, lang);
      return {
        actions: <ContactButton t={t} lang={lang} page={page} />,
        note: null,
        closing: (
          <a href={mailLink(page)} style={bottomLink}>
            <Mail size={15} /> {page.bottom.link}
          </a>
        ),
      };
    }
    return {
      actions: <StartButtons t={t} current={continueTarget()} onContinue={continueToData} onUpload={requestUpload} onSample={loadSampleData} />,
      note: (
        <p style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5, margin: "16px 0 0", maxWidth: 720 }}>
          {t("freeNote", { uploads: countText(t, "uploads", FREE_UPLOADS), questions: FREE_QUESTIONS })} {t("privacy")}
        </p>
      ),
    };
  }

  if (!hasEntered && shownPage !== "home") {
    const buttons = landingButtons(shownPage);
    return (
      <>
        <GlobalStyles />
        <LandingPage
          id={shownPage}
          lang={lang}
          t={t}
          toggle={<LanguageToggle lang={lang} onChange={changeLang} paths={PAGES[shownPage]} />}
          actions={buttons.actions}
          note={buttons.note}
          closing={buttons.closing}
          footer={<Footer t={t} onPrivacy={openPrivacy} links={pageLinks(lang, t, shownPage)} />}
        />
        {modals}
      </>
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
          onPlan={() => setUpgradeReason("")}
          current={continueTarget()}
          onContinue={continueToData}
          onClear={clearData}
          counts={counts}
          onCountUpload={openCountImport}
          onCountSample={loadSampleCounts}
          onCountContinue={showCountReport}
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

        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${COLORS.line}`, overflowX: "auto" }}>
          {[
            { key: "assistant", label: t("tabAssistant") },
            { key: "orders", label: t("tabOrders"), count: orderList.rows.length },
            { key: "dashboard", label: t("tabDashboard") },
            { key: "counts", label: t("tabCounts") },
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
                whiteSpace: "nowrap",
                flexShrink: 0,
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

        {view === "counts" ? (
          counts ? (
            <CycleCounts data={counts} inputs={countInputs} onInputs={setCountInputs} lang={lang} t={t} paid={paid} onHome={goHome} onReplace={openCountImport} onUpgrade={setUpgradeReason} />
          ) : (
            <div data-testid="counts-tab-empty">
              <div style={{ display: "flex", marginBottom: 18 }}>
                <button onClick={goHome} style={chipButtonStyle} data-testid="home">
                  <Home size={11} /> {t("home")}
                </button>
              </div>
              <CountsIntro t={t} counts={null} onUpload={openCountImport} onSample={loadSampleCounts} flush />
            </div>
          )
        ) : (
        <>
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
            <button
              onClick={() => setPlanWindow("active")}
              style={{ ...chipButtonStyle, color: COLORS.ok, border: `1px solid ${COLORS.ok}`, background: COLORS.okBg }}
            >
              <BadgeCheck size={11} /> {t("planActive")}
            </button>
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
              <DashboardDownload t={t} state={reportDownload} />
              <Dashboard items={items} lang={lang} t={t}>
                <CountSnapshot
                  counts={counts}
                  inputs={countInputs}
                  lang={lang}
                  t={t}
                  onOpen={showCountReport}
                  onUpload={openCountImport}
                  onSample={loadSampleCounts}
                />
              </Dashboard>
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
          <ReportCard t={t} state={reportDownload} locked={dashboardLocked} isSample={isSample} />
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
        </>
        )}
        <Footer t={t} onPrivacy={openPrivacy} />
      </div>
      {modals}
    </div>
  );
}
