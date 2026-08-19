import { useState, useRef, useEffect } from "react";
import { Send, Package, Lock, Clock, Download, Eye, EyeOff, FileText, Search, RotateCcw, Loader2, ArrowRight } from "lucide-react";
import inventory from "./data/inventory.json";
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

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4001";

const COLORS = {
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
  excess: "#3A5A8C",
  excessBg: "#E4E9F2",
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 760 : false
  );
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 760);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

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

function BarcodeStrip({ animated = false }) {
  const bars = Array.from({ length: 60 }, () => Math.random() > 0.5);
  return (
    <div style={{ position: "relative", height: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 2, height: 14, alignItems: "stretch", opacity: 0.55 }}>
        {bars.map((wide, i) => (
          <div
            key={i}
            style={{
              width: wide ? 3 : 1.5,
              background: COLORS.ink,
            }}
          />
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

const STATUS_META = {
  critical: { label: "CRITICAL", color: COLORS.critical, bg: COLORS.criticalBg },
  low: { label: "LOW", color: COLORS.low, bg: COLORS.lowBg },
  ok: { label: "OK", color: COLORS.ok, bg: COLORS.okBg },
  excess: { label: "EXCESS", color: COLORS.excess, bg: COLORS.excessBg },
};

function statusFor(item) {
  const ratio = item.stock / item.reorder_point;
  if (ratio < 0.5) return "critical";
  if (ratio < 1) return "low";
  if (ratio > 3) return "excess";
  return "ok";
}

function StatusStamp({ status }) {
  const meta = STATUS_META[status];
  const isCritical = status === "critical";
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        color: meta.color,
        background: meta.bg,
        border: `1.5px solid ${meta.color}`,
        borderRadius: 4,
        padding: "2px 7px",
        transform: isCritical ? "rotate(-2deg)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

function KPICard({ label, value, color }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 10,
        padding: "16px 18px",
        flex: 1,
        minWidth: 130,
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
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
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 30, fontWeight: 600, color: color || COLORS.ink }}>
        {value}
      </div>
    </div>
  );
}

function ChartCard({ title, children, height = 280 }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 10,
        padding: "18px 18px 10px",
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
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

function Dashboard() {
  const isMobile = useIsMobile();
  const statusCounts = { critical: 0, low: 0, ok: 0, excess: 0 };
  inventory.forEach((item) => {
    statusCounts[statusFor(item)] += 1;
  });

  const statusData = [
    { name: "Critical", value: statusCounts.critical, color: COLORS.critical },
    { name: "Low", value: statusCounts.low, color: COLORS.low },
    { name: "OK", value: statusCounts.ok, color: COLORS.ok },
    { name: "Excess", value: statusCounts.excess, color: COLORS.excess },
  ];

  const COVER_CHART_LIMIT = 10;
  const allCoverData = [...inventory]
    .map((item) => ({
      sku: item.sku,
      days: Number((item.stock / item.avg_daily_usage).toFixed(1)),
      color: STATUS_META[statusFor(item)].color,
    }))
    .sort((a, b) => a.days - b.days);
  const coverData = allCoverData.slice(0, COVER_CHART_LIMIT);
  const hiddenCount = allCoverData.length - coverData.length;

  const warehouseTotals = {};
  inventory.forEach((item) => {
    warehouseTotals[item.warehouse] = (warehouseTotals[item.warehouse] || 0) + item.stock;
  });
  const warehouseData = Object.entries(warehouseTotals).map(([name, value]) => ({ name, value }));
  const warehouseColors = [COLORS.ok, COLORS.low, COLORS.excess, COLORS.critical, COLORS.inkMuted];

  const totalUnits = inventory.reduce((sum, i) => sum + i.stock, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPICard label="Total SKUs" value={inventory.length} />
        <KPICard label="Critical" value={statusCounts.critical} color={COLORS.critical} />
        <KPICard label="Low" value={statusCounts.low} color={COLORS.low} />
        <KPICard label="Excess" value={statusCounts.excess} color={COLORS.excess} />
        <KPICard label="Total Units" value={totalUnits.toLocaleString()} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <ChartCard title="SKUs by Status">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.inkMuted }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkMuted }} axisLine={false} tickLine={false} width={24} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Units by Warehouse">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={warehouseData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {warehouseData.map((entry, i) => (
                  <Cell key={i} fill={warehouseColors[i % warehouseColors.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title={
          hiddenCount > 0
            ? `Days of Cover — ${COVER_CHART_LIMIT} Most Urgent SKUs (of ${inventory.length} total)`
            : "Days of Cover by SKU (lowest first)"
        }
        height={Math.max(220, coverData.length * 42)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={coverData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.inkMuted }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
            <YAxis
              type="category"
              dataKey="sku"
              tick={{ fontSize: 11, fill: COLORS.ink, fontFamily: "'IBM Plex Mono', monospace" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip />
            <Bar dataKey="days" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {coverData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
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

function Message({ role, text, onExport, isExporting, isMobile }) {
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
          fontFamily: "'Inter', system-ui, sans-serif",
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
              fontFamily: "'IBM Plex Mono', monospace",
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
                <Loader2 size={12} className="ia-spin" /> Generating...
              </>
            ) : (
              <>
                <Download size={12} /> Export report
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  "Which SKUs are below reorder point?",
  "Which SKUs have excess stock?",
  "Which products barely turn over?",
  "What should I order this week?",
];

const FULL_REPORT_PROMPT =
  "Generate a full inventory status report covering the executive summary, stock status overview, " +
  "reorder actions required, excess and slow-moving inventory, and recommendations — the kind presented " +
  "in a weekly operations review meeting.";

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

function WelcomeScreen({ onEnter }) {
  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: COLORS.bg,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes ia-scan {
          0% { left: 0%; opacity: 1; }
          45% { opacity: 1; }
          50% { left: calc(100% - 3px); opacity: 1; }
          55% { opacity: 0; }
          100% { left: 0%; opacity: 0; }
        }
        .ia-scanline { animation: ia-scan 2.2s ease-in-out infinite; }
      `}</style>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: COLORS.inkMuted,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Inventory Manifest · Powered by MiKardex
      </div>

      <h1
        style={{
          fontFamily: "'Oswald', sans-serif",
          fontSize: "clamp(36px, 8vw, 64px)",
          fontWeight: 600,
          color: COLORS.ink,
          margin: 0,
          letterSpacing: "0.01em",
          textTransform: "uppercase",
          lineHeight: 1.1,
        }}
      >
        Ask Your Inventory
      </h1>

      <div style={{ margin: "22px 0", maxWidth: 420, width: "100%" }}>
        <BarcodeStrip animated />
      </div>

      <p
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 15,
          color: COLORS.inkMuted,
          maxWidth: 440,
          lineHeight: 1.6,
          marginBottom: 32,
        }}
      >
        An AI operations analyst for your inventory. Ask about stockouts, excess stock, and reorder
        timing — or generate a full status report in seconds.
      </p>

      <button
        onClick={() => {
          playScanBeep();
          setTimeout(onEnter, 150);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          padding: "14px 26px",
          borderRadius: 8,
          border: "none",
          background: COLORS.ink,
          color: "#F4F1EA",
          cursor: "pointer",
        }}
      >
        Enter Assistant <ArrowRight size={15} />
      </button>
    </div>
  );
}

export default function InventoryAssistant() {
  useGoogleFonts();
  const isMobile = useIsMobile();
  const [hasEntered, setHasEntered] = useState(false);
  const warehouseCount = new Set(inventory.map((i) => i.warehouse)).size;
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: `${inventory.length} SKUs loaded across ${warehouseCount} warehouses. Start with a question, or generate the full status report.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [view, setView] = useState("assistant");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadedAt] = useState(() => new Date());
  const [exportingIndex, setExportingIndex] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function resetConversation() {
    setMessages([
      {
        role: "assistant",
        text: `${inventory.length} SKUs loaded across ${warehouseCount} warehouses. Start with a question, or generate the full status report.`,
      },
    ]);
    setInput("");
  }

  async function toggleShowPrompt() {
    if (!showPrompt && !systemPrompt) {
      try {
        const res = await fetch(`${API_URL}/api/system-prompt`);
        const data = await res.json();
        setSystemPrompt(data.prompt);
      } catch (err) {
        setSystemPrompt("Could not load system prompt — make sure the backend server is running.");
      }
    }
    setShowPrompt((s) => !s);
  }

  async function exportReport(text, actionItems = [], relevantCharts = [], index = null) {
    setExportingIndex(index);
    const startTime = Date.now();
    const clean = text.replace(/\*\*/g, "");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Inventory Assistant";
    workbook.created = new Date();

    const statusColors = {
      critical: "FFC1431F",
      low: "FFB8862E",
      ok: "FF2E6F4E",
      excess: "FF3A5A8C",
    };
    const priorityColors = {
      High: "FFC1431F",
      Medium: "FFB8862E",
      Low: "FF2E6F4E",
      None: "FF9AA096",
    };
    const statusFill = (status) => ({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: statusColors[status] || "FF6B7268" },
    });

    // Sheet 1: Report narrative
    const summary = workbook.addWorksheet("Report");
    summary.columns = [{ width: 100 }];
    const titleRow = summary.addRow(["INVENTORY REPORT"]);
    titleRow.font = { bold: true, size: 16, color: { argb: "FF15181A" } };
    summary.addRow([new Date().toLocaleString()]).font = { italic: true, color: { argb: "FF6B7268" } };
    summary.addRow([]);
    clean
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        const row = summary.addRow([line]);
        row.alignment = { wrapText: true, vertical: "top" };
        row.font = { size: 11, color: { argb: "FF15181A" } };
      });

    // Sheet 2: Action Plan — real columns, built from the model's structured output
    if (actionItems.length > 0) {
      const plan = workbook.addWorksheet("Action Plan");
      plan.columns = [
        { header: "SKU", key: "sku", width: 12 },
        { header: "Issue", key: "issue", width: 40 },
        { header: "Recommended Action", key: "action", width: 40 },
        { header: "Priority", key: "priority", width: 12 },
      ];
      const planHeader = plan.getRow(1);
      planHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
      planHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15181A" } };
      plan.views = [{ state: "frozen", ySplit: 1 }];

      actionItems.forEach((item) => {
        const row = plan.addRow({
          sku: item.sku || "—",
          issue: item.issue || "",
          action: item.recommended_action || "",
          priority: item.priority || "None",
        });
        row.getCell("issue").alignment = { wrapText: true, vertical: "top" };
        row.getCell("action").alignment = { wrapText: true, vertical: "top" };
        const priorityCell = row.getCell("priority");
        priorityCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: priorityColors[item.priority] || priorityColors.None },
        };
        priorityCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        priorityCell.alignment = { horizontal: "center" };
        row.eachCell((cell) => {
          cell.border = { bottom: { style: "hair", color: { argb: "FFDADFD7" } } };
        });
      });
    }

    // Sheet 3: Full inventory snapshot
    const sheet = workbook.addWorksheet("Inventory Snapshot");
    sheet.columns = [
      { header: "SKU", key: "sku", width: 12 },
      { header: "Name", key: "name", width: 30 },
      { header: "Warehouse", key: "warehouse", width: 16 },
      { header: "Stock", key: "stock", width: 10 },
      { header: "Reorder Point", key: "reorder", width: 15 },
      { header: "Lead Time (days)", key: "lead", width: 16 },
      { header: "Avg Daily Usage", key: "usage", width: 16 },
      { header: "Days of Cover", key: "cover", width: 14 },
      { header: "Status", key: "status", width: 12 },
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15181A" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    inventory.forEach((item) => {
      const ratio = item.stock / item.reorder_point;
      const status = ratio < 0.5 ? "critical" : ratio < 1 ? "low" : ratio > 3 ? "excess" : "ok";
      const row = sheet.addRow({
        sku: item.sku,
        name: item.name,
        warehouse: item.warehouse,
        stock: item.stock,
        reorder: item.reorder_point,
        lead: item.lead_time_days,
        usage: item.avg_daily_usage,
        cover: Number((item.stock / item.avg_daily_usage).toFixed(1)),
        status: status.toUpperCase(),
      });
      const statusCell = row.getCell("status");
      statusCell.fill = statusFill(status);
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
    a.download = `inventory-report-${dateStamp}.xlsx`;
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
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);

    try {
      const historyForApi = messages
        .filter((m, i) => i > 0 && (m.role === "user" || m.role === "assistant"))
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch(`${API_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, inventory, history: historyForApi }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer, actionItems: data.actionItems || [], relevantCharts: data.relevantCharts || [] },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Something went wrong reaching the assistant. Make sure the backend server is running." },
      ]);
    } finally {
      setTyping(false);
    }
  }

  if (!hasEntered) {
    return <WelcomeScreen onEnter={() => setHasEntered(true)} />;
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: COLORS.bg, minHeight: "100vh", padding: isMobile ? "20px 14px" : "36px 20px" }}>
      <style>{`
        @keyframes ia-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ia-spin { animation: ia-spin 0.8s linear infinite; }
      `}</style>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            color: COLORS.inkMuted,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Inventory Manifest · Powered by MiKardex
        </div>
        <h1
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontSize: isMobile ? 24 : 34,
            fontWeight: 600,
            color: COLORS.ink,
            margin: 0,
            letterSpacing: "0.01em",
            textTransform: "uppercase",
          }}
        >
          Ask your inventory
        </h1>

        <div style={{ margin: "16px 0 18px" }}>
          <BarcodeStrip />
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${COLORS.line}` }}>
          {[
            { key: "assistant", label: "Assistant" },
            { key: "dashboard", label: "Dashboard" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
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
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: COLORS.inkMuted,
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.line}`,
              padding: "5px 10px",
              borderRadius: 5,
              textTransform: "uppercase",
            }}
          >
            <Clock size={11} /> Synced {loadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: COLORS.inkMuted,
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.line}`,
              padding: "5px 10px",
              borderRadius: 5,
              textTransform: "uppercase",
            }}
          >
            <Lock size={11} /> Read-only
          </span>
          <button
            onClick={toggleShowPrompt}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: COLORS.ink,
              background: "none",
              border: `1px solid ${COLORS.ink}`,
              padding: "5px 10px",
              borderRadius: 5,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {showPrompt ? <EyeOff size={11} /> : <Eye size={11} />} {showPrompt ? "Hide" : "View"} prompt
          </button>
          <button
            onClick={resetConversation}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: COLORS.inkMuted,
              background: "none",
              border: `1px solid ${COLORS.line}`,
              padding: "5px 10px",
              borderRadius: 5,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            <RotateCcw size={11} /> New conversation
          </button>
        </div>

        {showPrompt && (
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
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {systemPrompt || "Loading..."}
          </pre>
        )}

        {view === "dashboard" ? (
          <Dashboard />
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 20 }}>
          {/* Chat panel */}
          <div
            style={{
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              height: isMobile ? 480 : 560,
            }}
          >
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 20px 4px" }}>
              {messages.map((m, i) => (
                <Message
                  key={i}
                  role={m.role}
                  text={m.text}
                  isMobile={isMobile}
                  isExporting={exportingIndex === i}
                  onExport={m.role === "assistant" && i > 0 ? () => exportReport(m.text, m.actionItems || [], m.relevantCharts || [], i) : null}
                />
              ))}
              {typing && (
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12,
                    letterSpacing: "0.04em",
                    color: COLORS.inkMuted,
                    padding: "4px 4px 10px",
                  }}
                >
                  PROCESSING...
                </div>
              )}
            </div>

            {!typing && (
            <div style={{ padding: "10px 20px 0", display: "flex", flexWrap: "wrap", gap: 7, borderTop: `1px solid ${COLORS.line}`, paddingTop: 14 }}>
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 12.5,
                    padding: "7px 12px",
                    borderRadius: 20,
                    border: `1px solid ${COLORS.line}`,
                    background: COLORS.surface,
                    color: COLORS.ink,
                    cursor: "pointer",
                  }}
                >
                  {q}
                </button>
              ))}
              <button
                onClick={() => send(FULL_REPORT_PROMPT)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
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
                <FileText size={12} /> Generate Status Report
              </button>
            </div>
            )}

            <div style={{ padding: 16, display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask a question about your inventory..."
                style={{
                  flex: 1,
                  fontFamily: "'Inter', system-ui, sans-serif",
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
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Send size={16} />
              </button>
            </div>
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
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <Package size={15} color={COLORS.ink} />
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: COLORS.ink,
                  textTransform: "uppercase",
                }}
              >
                Current inventory
              </span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <BarcodeStrip />
            </div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search
                size={13}
                color={COLORS.inkMuted}
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SKU or name..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 12.5,
                  padding: "8px 10px 8px 30px",
                  borderRadius: 6,
                  border: `1px solid ${COLORS.line}`,
                  outline: "none",
                  background: COLORS.surface,
                }}
              />
            </div>
            {inventory
              .filter((item) => {
                const q = searchQuery.trim().toLowerCase();
                if (!q) return true;
                return item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
              })
              .map((item) => {
              const status = statusFor(item);
              return (
                <div key={item.sku} style={{ padding: "12px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.ink, lineHeight: 1.3 }}>
                      {item.name}
                    </div>
                    <StatusStamp status={status} />
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: COLORS.inkMuted, letterSpacing: "0.03em" }}>
                    {item.sku} · {item.warehouse}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.ink, marginTop: 4 }}>
                    STOCK {item.stock} / REORDER {item.reorder_point}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
