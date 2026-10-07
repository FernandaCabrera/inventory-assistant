// The account on screen: the window to sign in with an email and a code, the "My account" window
// with the history of analyses, and the card that says what changed since the previous analysis.

import { useEffect, useRef, useState } from "react";
import { Loader2, LogOut, Mail, Trash2, UserRound, ArrowRight } from "lucide-react";
import Modal from "./Modal";
import { COLORS, FONT_MONO, FONT_HEAD, monoLabel, primaryButton, secondaryButton, textInput } from "./theme";
import { CONTACT_EMAIL } from "./config";
import { LOCALES, formatNumber, formatMoney } from "./i18n";
import { useIsMobile } from "./ui";
import { startSignIn, verifySignIn, changesBetween, withPrevious, figure, TRACKED } from "./account";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A sleeping server takes up to a minute to answer its first request: sending the code is tried
// again this many times, this far apart, before giving up.
export const SIGN_IN_RETRY = { tries: 14, waitMs: 5000 };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const when = (lang, ms) => new Date(ms).toLocaleString(LOCALES[lang] || LOCALES.en, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const shortDay = (lang, ms) => new Date(ms).toLocaleDateString(LOCALES[lang] || LOCALES.en, { day: "numeric", month: "short", year: "numeric" });
const hour = (lang, ms) => new Date(ms).toLocaleTimeString(LOCALES[lang] || LOCALES.en, { hour: "2-digit", minute: "2-digit" });
const day = (lang, ms) => new Date(ms).toLocaleDateString(LOCALES[lang] || LOCALES.en, { day: "numeric", month: "long", year: "numeric" });
const amount = (lang, value, money) => (money ? formatMoney(lang, value) : formatNumber(lang, value, 2));
const signed = (lang, delta, money) => `${delta > 0 ? "+" : "−"}${amount(lang, Math.abs(delta), money)}`;
const VERDICT_COLOR = { better: COLORS.ok, worse: COLORS.critical, same: COLORS.inkMuted, neutral: COLORS.inkMuted };

const linkButton = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, color: COLORS.ink, textDecoration: "underline", textUnderlineOffset: 3 };

// intent: "upload" (they pressed "upload your Excel") or "account" (they pressed "sign in").
// onSkip: given when the visitor may carry on without an account if signing in cannot work right now.
export function SignInModal({ t, lang, apiUrl, intent, onSignedIn, onSkip, onClose, onPrivacy }) {
  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [news, setNews] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(null); // null | "sending" | "connecting" | "checking"
  const [error, setError] = useState(null); // { key, vars, canSkip }
  const [wait, setWait] = useState(0); // seconds until another code can be asked for
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
    },
    []
  );
  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function send(e) {
    if (e) e.preventDefault();
    const clean = email.trim();
    if (!EMAIL_PATTERN.test(clean)) {
      setError({ key: "acErrEmail" });
      return;
    }
    setError(null);
    setBusy("sending");
    let result = { status: 0, data: {} };
    for (let attempt = 0; attempt < SIGN_IN_RETRY.tries; attempt += 1) {
      result = await startSignIn(apiUrl, { email: clean, lang });
      if (!open.current) return;
      if (result.status !== 0) break;
      setBusy("connecting");
      if (attempt < SIGN_IN_RETRY.tries - 1) await pause(SIGN_IN_RETRY.waitMs);
      if (!open.current) return;
    }
    setBusy(null);
    const reason = result.data.error;
    if (result.status === 200 || (result.status === 429 && reason === "wait")) {
      // "wait": a code went out less than a minute ago, and it still works
      setStep("code");
      setCode("");
      setWait(result.status === 200 ? 60 : Number(result.data.seconds) || 60);
    } else if (result.status === 400) setError({ key: "acErrEmail" });
    else if (result.status === 429) setError({ key: "acErrLimit", vars: { contact: CONTACT_EMAIL }, canSkip: true });
    else if (reason === "disabled" && onSkip) onSkip(); // accounts are switched off on the server: nothing to sign in to
    else setError({ key: "acErrUnavailable", canSkip: true });
  }

  async function check(e) {
    e.preventDefault();
    if (code.replace(/\D/g, "").length !== 6) {
      setError({ key: "acErrDigits" });
      return;
    }
    setError(null);
    setBusy("checking");
    const result = await verifySignIn(apiUrl, { email: email.trim(), code, lang, marketingOk: news });
    if (!open.current) return;
    setBusy(null);
    const reason = result.data.error;
    if (result.status === 200 && result.data.token) onSignedIn({ token: result.data.token, account: result.data.account });
    else if (reason === "code") setError({ key: "acErrCode", vars: { left: result.data.left } });
    else if (reason === "expired") setError({ key: "acErrExpired" });
    else if (reason === "locked") setError({ key: "acErrLocked" });
    else if (result.status === 429) setError({ key: "acErrLimit", vars: { contact: CONTACT_EMAIL }, canSkip: true });
    else setError({ key: "acErrUnavailable", canSkip: true });
  }

  const working = busy !== null;
  const errorBox = error && (
    <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, lineHeight: 1.5 }}>
      {t(error.key, error.vars)}
      {error.canSkip && onSkip && (
        <div style={{ marginTop: 10, color: COLORS.ink }}>
          <button type="button" onClick={onSkip} style={{ ...secondaryButton, padding: "9px 14px", fontSize: 11.5 }}>
            {t("acSkip")} <ArrowRight size={13} />
          </button>
          <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 6 }}>{t("acSkipNote")}</div>
        </div>
      )}
    </div>
  );

  return (
    <Modal title={t("acTitle")} onClose={onClose} closeLabel={t("close")} width={480}>
      {step === "email" ? (
        <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{t(intent === "upload" ? "acLeadUpload" : "acLeadAccount")}</p>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder={t("acEmail")}
            aria-label={t("acEmail")}
            autoComplete="email"
            autoFocus
            style={textInput}
          />
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, color: COLORS.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
            {t("acNews")}
          </label>
          <button type="submit" disabled={working} style={{ ...primaryButton, alignSelf: "flex-start", opacity: working ? 0.6 : 1 }}>
            {working ? <Loader2 size={14} className="ia-spin" /> : <Mail size={14} />} {working ? t("acSending") : t("acSend")}
          </button>
          {busy === "connecting" && (
            <div role="status" style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              {t("acConnecting")}
            </div>
          )}
          {errorBox}
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.55, margin: "2px 0 0" }}>
            {t("acKeeps")}{" "}
            <button type="button" onClick={onPrivacy} style={{ ...linkButton, fontSize: 12.5, color: COLORS.inkMuted }}>
              {t("privacyTitle")}
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={check} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{t("acCodeSent", { email: email.trim() })}</p>
          <label htmlFor="ac-code" style={{ ...monoLabel, fontSize: 10.5, color: COLORS.inkMuted, marginBottom: -6 }}>
            {t("acCode")}
          </label>
          <input
            id="ac-code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 8));
              setError(null);
            }}
            placeholder="000000"
            aria-label={t("acCode")}
            autoComplete="one-time-code"
            autoFocus
            style={{ ...textInput, fontFamily: FONT_MONO, fontSize: 20, letterSpacing: "0.3em", maxWidth: 220 }}
          />
          <button type="submit" disabled={working} style={{ ...primaryButton, alignSelf: "flex-start", opacity: working ? 0.6 : 1 }}>
            {working && <Loader2 size={14} className="ia-spin" />} {busy === "checking" ? t("acChecking") : t("acEnter")}
          </button>
          {busy === "connecting" && (
            <div role="status" style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
              {t("acConnecting")}
            </div>
          )}
          {errorBox}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13.5, color: COLORS.inkMuted }}>
            {wait > 0 ? (
              <span>{t("acResendWait", { seconds: wait })}</span>
            ) : (
              <button type="button" onClick={() => send()} disabled={working} style={linkButton}>
                {t("acResend")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              style={linkButton}
            >
              {t("acOtherEmail")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// the names of the figures are long: they wrap, so the table fits the window without scrolling sideways
const th = { ...monoLabel, fontSize: 10, lineHeight: 1.35, color: COLORS.inkMuted, textAlign: "right", verticalAlign: "bottom", padding: "8px 10px", borderBottom: `1px solid ${COLORS.line}`, maxWidth: 96 };
const td = { padding: "9px 10px", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 13, color: COLORS.ink, textAlign: "right", fontFamily: FONT_MONO, whiteSpace: "nowrap", verticalAlign: "top" };

// Every analysis of the account, newest first, each figure with its change from the analysis before.
// A table on a wide screen; on a phone, one card per analysis, because seven columns do not fit.
function HistoryTable({ t, lang, analyses }) {
  const isMobile = useIsMobile();
  // a column is shown when at least one analysis has that figure (a file without costs has no money)
  const columns = TRACKED.filter((item) => item.key !== "orderCost" && analyses.some((analysis) => figure(analysis, item.key) !== null));
  const changesOf = (i) => (analyses[i + 1] ? changesBetween(analyses[i], analyses[i + 1]) : []);
  const delta = (changes, key) => {
    const change = changes.find((c) => c.key === key);
    if (!change || change.delta === 0) return null;
    return <div style={{ fontSize: 11, color: VERDICT_COLOR[change.verdict] }}>{signed(lang, change.delta, change.money)}</div>;
  };

  if (isMobile) {
    return (
      <div data-testid="history-table" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {analyses.map((analysis, i) => {
          const changes = changesOf(i);
          const cells = [{ key: "skus", label: "kpiTotal", money: false }, ...columns].filter((item) => figure(analysis, item.key) !== null);
          return (
            <div key={analysis.id} data-testid="history-entry" style={{ border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, overflowWrap: "anywhere" }}>{analysis.fileName}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: COLORS.inkMuted, margin: "2px 0 10px" }}>
                {shortDay(lang, analysis.createdAt)} · {hour(lang, analysis.createdAt)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                {cells.map((item) => (
                  <div key={item.key} style={{ minWidth: 0 }}>
                    <div style={{ ...monoLabel, fontSize: 9.5, lineHeight: 1.35, color: COLORS.inkMuted, marginBottom: 2 }}>{t(item.label)}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: COLORS.ink }}>{amount(lang, figure(analysis, item.key), item.money)}</div>
                    {delta(changes, item.key)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }} data-testid="history-table">
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>{t("acColDate")}</th>
            <th style={{ ...th, textAlign: "left" }}>{t("acColFile")}</th>
            <th style={th}>{t("kpiTotal")}</th>
            {columns.map((item) => (
              <th key={item.key} style={th}>
                {t(item.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {analyses.map((analysis, i) => {
            const changes = changesOf(i);
            return (
              <tr key={analysis.id}>
                <td style={{ ...td, textAlign: "left" }}>
                  {shortDay(lang, analysis.createdAt)}
                  <div style={{ fontSize: 11, color: COLORS.inkMuted }}>{hour(lang, analysis.createdAt)}</div>
                </td>
                <td style={{ ...td, textAlign: "left", fontFamily: "inherit", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" }} title={analysis.fileName}>
                  {analysis.fileName}
                </td>
                <td style={td}>{figure(analysis, "skus") === null ? "" : formatNumber(lang, figure(analysis, "skus"))}</td>
                {columns.map((item) => {
                  const value = figure(analysis, item.key);
                  return (
                    <td key={item.key} style={td}>
                      {value === null ? "" : amount(lang, value, item.money)}
                      {delta(changes, item.key)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// account: what the server says about it. paid: this visitor has the plan (by the account or by a code).
// actions: { onPlan, onNews(value), onClearHistory, onSignOut, onDelete } - the ones that talk to the
// server return true when it worked.
export function AccountModal({ t, lang, account, paid, onPlan, onNews, onClearHistory, onSignOut, onDelete, onClose }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(action, confirmKey) {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setBusy(true);
    setFailed(false);
    const worked = await action();
    setBusy(false);
    if (worked === false) setFailed(true);
  }

  const section = { ...monoLabel, color: COLORS.ink, margin: "22px 0 10px" };
  const quiet = { ...secondaryButton, padding: "8px 12px", fontSize: 11, color: COLORS.inkMuted, border: `1px solid ${COLORS.line}` };

  return (
    <Modal title={t("acMyAccount")} onClose={onClose} closeLabel={t("close")} width={940}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, overflowWrap: "anywhere" }} data-testid="account-email">
            {account.email}
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 2 }}>{t("acSince", { date: day(lang, account.createdAt) })}</div>
          <div style={{ fontSize: 14, marginTop: 8, color: paid ? COLORS.ok : COLORS.ink, fontWeight: paid ? 600 : 400 }} data-testid="account-plan">
            {paid ? t("acPlanActive") : t("acPlanFree", { used: Math.min(account.uploadsUsed, account.uploadsMax), max: account.uploadsMax })}
          </div>
        </div>
        <button onClick={onPlan} style={{ ...secondaryButton, padding: "9px 14px", fontSize: 11.5 }}>
          {paid ? t("planYours") : t("seePlan")} <ArrowRight size={13} />
        </button>
      </div>

      <div style={section}>{t("acHistoryTitle")}</div>
      {account.analyses.length === 0 ? (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: COLORS.inkMuted, margin: 0 }}>{t("acHistoryEmpty")}</p>
      ) : (
        <>
          <HistoryTable t={t} lang={lang} analyses={account.analyses} />
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, margin: "8px 0 0" }}>{t("acHistoryNote")}</p>
        </>
      )}

      <div style={section}>{t("acSettings")}</div>
      <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, cursor: "pointer", marginBottom: 14 }}>
        <input type="checkbox" checked={account.marketingOk} disabled={busy} onChange={(e) => run(() => onNews(e.target.checked))} style={{ marginTop: 3, flexShrink: 0 }} />
        {t("acNews")}
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => run(onSignOut, "acSignOutConfirm")} disabled={busy} style={{ ...secondaryButton, padding: "8px 12px", fontSize: 11 }}>
          <LogOut size={12} /> {t("acSignOut")}
        </button>
        {account.analyses.length > 0 && (
          <button onClick={() => run(onClearHistory, "acClearConfirm")} disabled={busy} style={quiet}>
            <Trash2 size={12} /> {t("acClearHistory")}
          </button>
        )}
        <button onClick={() => run(onDelete, "acDeleteConfirm")} disabled={busy} style={quiet}>
          <Trash2 size={12} /> {t("acDelete")}
        </button>
      </div>
      {failed && (
        <div role="alert" style={{ color: COLORS.critical, fontSize: 13.5, marginTop: 10 }}>
          {t("acActionError")}
        </div>
      )}
    </Modal>
  );
}

// In the assistant tab, after a file is loaded: what changed since the analysis before it
export function SinceLast({ t, lang, account, analysisId, onHistory }) {
  const pair = withPrevious(account, analysisId);
  if (!pair) return null;
  const changes = pair.previous ? changesBetween(pair.current, pair.previous) : [];
  return (
    <div data-testid="since-last" style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 600, textTransform: "uppercase", margin: 0, color: COLORS.ink }}>{t("acSinceTitle")}</h2>
        <button onClick={onHistory} style={linkButton}>
          {t("acHistoryLink")}
        </button>
      </div>
      {!pair.previous ? (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: COLORS.ink, margin: "8px 0 0" }}>{t("acFirstAnalysis")}</p>
      ) : (
        <>
          <div style={{ fontSize: 13, color: COLORS.inkMuted, margin: "4px 0 12px", overflowWrap: "anywhere" }}>
            {when(lang, pair.previous.createdAt)} · {pair.previous.fileName}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px 20px" }}>
            {changes.map((change) => (
              <div key={change.key} data-testid={`change-${change.key}`}>
                <div style={{ ...monoLabel, fontSize: 10, color: COLORS.inkMuted, marginBottom: 3 }}>{t(change.label)}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: COLORS.ink }}>
                  {amount(lang, change.from, change.money)} → <strong>{amount(lang, change.to, change.money)}</strong>
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 600, color: VERDICT_COLOR[change.verdict] }}>
                  {change.delta === 0 ? t("acSinceSame") : signed(lang, change.delta, change.money)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// The small button that opens the account, or the sign-in window when nobody is signed in
export function AccountButton({ t, account, onClick, style }) {
  return (
    <button onClick={onClick} style={style} data-testid="account-button" title={account ? account.email : undefined}>
      <UserRound size={11} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{account ? t("acMyAccount") : t("acSignIn")}</span>
    </button>
  );
}
