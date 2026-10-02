import { useEffect } from "react";
import { X } from "lucide-react";
import { COLORS, FONT_HEAD, FONT_BODY } from "./theme";

export default function Modal({ title, onClose, closeLabel, children, width = 560 }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // keep the page behind from scrolling while the window is open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(21, 24, 26, 0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "5vh 14px",
        overflowY: "auto",
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%",
          maxWidth: width,
          background: COLORS.surface,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 12,
          padding: "22px 22px 24px",
          fontFamily: FONT_BODY,
          color: COLORS.ink,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h2
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.01em",
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: `1px solid ${COLORS.line}`,
              background: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.ink,
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
