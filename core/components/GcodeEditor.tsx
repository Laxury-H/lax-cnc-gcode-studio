import { useEffect, useMemo, useRef, useState } from "react";
import type { TranslationDict } from "../../app/i18n";
import { Icon } from "./ui/Icon";

interface GcodeEditorProps {
  t: TranslationDict;
  gcode: string;
  onChange: (value: string) => void;
  currentLineNumber?: number;
  onSeekToLine?: (lineNumber: number) => void;
  breakpoints?: Set<number>;
  onToggleBreakpoint?: (lineNumber: number) => void;
}

export function highlightGcodeLine(line: string): React.ReactNode[] {
  if (!line) return [" "];

  // Comment check
  const semiIdx = line.indexOf(";");
  const parenIdx = line.indexOf("(");

  let commentStart = -1;
  if (semiIdx !== -1 && parenIdx !== -1) {
    commentStart = Math.min(semiIdx, parenIdx);
  } else if (semiIdx !== -1) {
    commentStart = semiIdx;
  } else if (parenIdx !== -1) {
    commentStart = parenIdx;
  }

  const codePart = commentStart !== -1 ? line.slice(0, commentStart) : line;
  const commentPart = commentStart !== -1 ? line.slice(commentStart) : "";

  const tokens: React.ReactNode[] = [];
  const regex = /([Gg]\d+(?:\.\d+)?|[Mm]\d+|[XYZABCxyzabc][-+]?\d*\.?\d+|[IJKRijkr][-+]?\d*\.?\d+|[FSTfst][-+]?\d*\.?\d+|[Nn]\d+|[^\s]+|\s+)/g;

  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(codePart)) !== null) {
    const token = match[0];
    const firstChar = token[0].toUpperCase();

    if (firstChar === "G") {
      tokens.push(
        <span key={key++} style={{ color: "#38bdf8", fontWeight: "700" }}>
          {token}
        </span>
      );
    } else if (firstChar === "M") {
      tokens.push(
        <span key={key++} style={{ color: "#fbbf24", fontWeight: "700" }}>
          {token}
        </span>
      );
    } else if (firstChar === "X" || firstChar === "Y" || firstChar === "Z" || firstChar === "A" || firstChar === "B" || firstChar === "C") {
      tokens.push(
        <span key={key++} style={{ color: "#4ade80" }}>
          {token}
        </span>
      );
    } else if (firstChar === "I" || firstChar === "J" || firstChar === "K" || firstChar === "R") {
      tokens.push(
        <span key={key++} style={{ color: "#c084fc" }}>
          {token}
        </span>
      );
    } else if (firstChar === "F" || firstChar === "S" || firstChar === "T") {
      tokens.push(
        <span key={key++} style={{ color: "#f472b6", fontWeight: "600" }}>
          {token}
        </span>
      );
    } else if (firstChar === "N") {
      tokens.push(
        <span key={key++} style={{ color: "#64748b" }}>
          {token}
        </span>
      );
    } else {
      tokens.push(
        <span key={key++} style={{ color: "#e2e8f0" }}>
          {token}
        </span>
      );
    }
  }

  if (commentPart) {
    tokens.push(
      <span key={key++} style={{ color: "#64748b", fontStyle: "italic" }}>
        {commentPart}
      </span>
    );
  }

  return tokens.length > 0 ? tokens : [line];
}

export function GcodeEditor({
  t,
  gcode,
  onChange,
  currentLineNumber,
  onSeekToLine,
  breakpoints = new Set(),
  onToggleBreakpoint,
}: GcodeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(gcode);
  const [prevGcode, setPrevGcode] = useState(gcode);
  if (gcode !== prevGcode) {
    setPrevGcode(gcode);
    setEditText(gcode);
  }
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const lines = useMemo(() => gcode.split(/\r?\n/), [gcode]);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing && currentLineNumber && activeLineRef.current && listContainerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [currentLineNumber, isEditing]);

  const handleFormat = () => {
    const formatted = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("(") || trimmed.startsWith(";")) return trimmed;
        return trimmed
          .replace(/([GgMmXxYyZzIiJjKkRrFfSsTtNn])/g, " $1")
          .replace(/\s+/g, " ")
          .trim();
      })
      .join("\n");
    onChange(formatted);
    setEditText(formatted);
  };

  const handleClean = () => {
    const cleaned = lines
      .map((l) => l.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim())
      .filter((l) => l.length > 0)
      .join("\n");
    onChange(cleaned);
    setEditText(cleaned);
  };

  const handleAddSafeHeader = () => {
    const header = [
      "(SAFE START HEADER)",
      "G90 G21 G17 G54 G80 G49",
      "M5",
      "G0 Z10.000",
    ].join("\n");
    const updated = `${header}\n${gcode}`;
    onChange(updated);
    setEditText(updated);
  };

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const replaced = editText.replaceAll(searchQuery, replaceQuery);
    setEditText(replaced);
    onChange(replaced);
  };

  const handleApplyEdit = () => {
    onChange(editText);
    setIsEditing(false);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#090d16",
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "13px",
      }}
    >
      {/* Editor Top Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px",
          padding: "8px 12px",
          background: "rgba(30, 41, 59, 0.7)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          style={{
            padding: "4px 10px",
            borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: isEditing ? "#0284c7" : "#1e293b",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Icon name="edit" size={14} />
          {isEditing ? "Xem màu & Chạy" : "Chỉnh sửa mã (Edit)"}
        </button>

        <button
          type="button"
          onClick={handleFormat}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "#1e293b",
            color: "#cbd5e1",
            fontSize: "11px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
          title={t.editorFormat}
        >
          <Icon name="sparkles" size={13} />
          {t.editorFormat}
        </button>

        <button
          type="button"
          onClick={handleClean}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "#1e293b",
            color: "#cbd5e1",
            fontSize: "11px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
          title={t.editorClean}
        >
          {t.editorClean}
        </button>

        <button
          type="button"
          onClick={handleAddSafeHeader}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "#1e293b",
            color: "#4ade80",
            fontSize: "11px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
          title={t.editorAddSafeHeader}
        >
          <Icon name="shield" size={13} />
          + Safe Header
        </button>

        <button
          type="button"
          onClick={() => setShowSearch(!showSearch)}
          style={{
            marginLeft: "auto",
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: showSearch ? "#0369a1" : "#1e293b",
            color: "#cbd5e1",
            fontSize: "11px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Icon name="search" size={13} />
          Tìm & Thay thế
        </button>
      </div>

      {/* Search & Replace Dropdown Panel */}
      {showSearch && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "8px 12px",
            background: "#111827",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "4px",
              padding: "4px 8px",
              color: "#fff",
              fontSize: "12px",
            }}
          />
          <input
            type="text"
            placeholder="Thay thế bằng..."
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            style={{
              flex: 1,
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "4px",
              padding: "4px 8px",
              color: "#fff",
              fontSize: "12px",
            }}
          />
          <button
            type="button"
            onClick={handleReplaceAll}
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Thay thế tất cả
          </button>
        </div>
      )}

      {/* Main Content Area: Raw Textarea vs Interactive Syntax Highlighted Lines */}
      {isEditing ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{
              flex: 1,
              width: "100%",
              background: "transparent",
              color: "#f8fafc",
              border: "none",
              padding: "12px",
              fontFamily: "monospace",
              fontSize: "13px",
              lineHeight: "1.6",
              resize: "none",
              outline: "none",
            }}
            spellCheck={false}
          />
          <div style={{ padding: "8px 12px", background: "#111827", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={() => {
                setEditText(gcode);
                setIsEditing(false);
              }}
              style={{ padding: "6px 12px", background: "#334155", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleApplyEdit}
              style={{ padding: "6px 16px", background: "#0284c7", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
            >
              Lưu & Phân tích G-code
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={listContainerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isActive = currentLineNumber === lineNum;
            const hasBreakpoint = breakpoints.has(lineNum);

            return (
              <div
                key={lineNum}
                ref={isActive ? activeLineRef : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: "26px",
                  padding: "0 8px",
                  background: isActive
                    ? "rgba(56, 189, 248, 0.18)"
                    : hasBreakpoint
                      ? "rgba(239, 68, 68, 0.12)"
                      : "transparent",
                  borderLeft: isActive
                    ? "3px solid #38bdf8"
                    : hasBreakpoint
                      ? "3px solid #ef4444"
                      : "3px solid transparent",
                  cursor: "pointer",
                }}
                onClick={() => onSeekToLine?.(lineNum)}
                title="Nhấp chuột để tua mô phỏng đến dòng này"
              >
                {/* Breakpoint toggle button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBreakpoint?.(lineNum);
                  }}
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "999px",
                    border: hasBreakpoint ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.15)",
                    background: hasBreakpoint ? "#ef4444" : "transparent",
                    marginRight: "6px",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title={hasBreakpoint ? "Xóa Breakpoint" : "Thêm Breakpoint"}
                />

                {/* Line number */}
                <span
                  style={{
                    width: "44px",
                    color: isActive ? "#38bdf8" : "#64748b",
                    textAlign: "right",
                    marginRight: "14px",
                    userSelect: "none",
                    fontWeight: isActive ? "700" : "400",
                  }}
                >
                  {lineNum}
                </span>

                {/* Active arrow pointer */}
                {isActive && (
                  <span style={{ color: "#38bdf8", marginRight: "6px", userSelect: "none" }}>
                    ▶
                  </span>
                )}

                {/* Syntax Highlighted tokens */}
                <span style={{ whiteSpace: "pre", flex: 1 }}>
                  {highlightGcodeLine(line)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
