import { useId, useMemo } from "react";
import type { TranslationDict } from "../../app/i18n";
import type { Simulation, StockSettings, StudioMachineProfile } from "../simulation/types";
import { Icon } from "./ui/Icon";
import { ResponsiveDialog } from "./ui/ResponsiveDialog";
import { formatLength, formatTime } from "../utils/gcode-utils";
import styles from "./ui/ResponsiveDialog.module.css";

interface JobSetupSheetModalProps {
  t: TranslationDict;
  simulation: Simulation | null;
  stock: StockSettings;
  machineProfile: StudioMachineProfile;
  programName?: string;
  onClose: () => void;
}

interface ToolSummary {
  id: string;
  name: string;
  type: string;
  diameter: number;
  minZ: number;
  cutLength: number;
  feedRate: number;
  spindleRpm: number;
  operationsCount: number;
}

export function JobSetupSheetModal({
  t,
  simulation,
  stock,
  machineProfile,
  programName = "Chương trình CNC",
  onClose,
}: JobSetupSheetModalProps) {
  const titleId = useId();

  const toolSummaries = useMemo<ToolSummary[]>(() => {
    if (!simulation || !simulation.segments) return [];

    const map = new Map<string, ToolSummary>();

    for (const seg of simulation.segments) {
      const toolId = seg.tool || "1";
      const profile = (stock.tools ?? []).find(
        (tp) => tp.id === toolId || Number(tp.id) === Number(toolId),
      );

      let summary = map.get(toolId);
      if (!summary) {
        summary = {
          id: toolId,
          name: profile?.name || `Dao #${toolId}`,
          type: profile?.type ? profile.type.toUpperCase() : "FLAT",
          diameter: profile?.diameter ?? stock.toolDiameter ?? 6,
          minZ: 0,
          cutLength: 0,
          feedRate: seg.feed || 1000,
          spindleRpm: seg.spindle || 18000,
          operationsCount: 0,
        };
        map.set(toolId, summary);
      }

      if (seg.kind === "cut" || seg.kind === "arc-cw" || seg.kind === "arc-ccw" || seg.kind === "drill") {
        summary.cutLength += seg.length;
        summary.operationsCount += 1;
        if (seg.feed > 0) summary.feedRate = Math.max(summary.feedRate, seg.feed);
        if (seg.spindle > 0) summary.spindleRpm = Math.max(summary.spindleRpm, seg.spindle);
        if (Number.isFinite(seg.end.z)) {
          summary.minZ = Math.min(summary.minZ, seg.end.z);
        }
      }
    }

    return Array.from(map.values());
  }, [simulation, stock]);

  const handlePrint = () => {
    window.print();
  };

  const bounds = simulation?.bounds;
  const cutTime = simulation ? simulation.estimatedSeconds : 0;
  const rapidDist = simulation?.rapidLength ?? 0;
  const cutDist = simulation?.cutLength ?? 0;

  return (
    <ResponsiveDialog
      onClose={onClose}
      titleId={titleId}
      size="large"
      height="auto"
    >
      <header className={styles.header}>
        <h2
          className={`${styles.heading} ${styles.headingWithIcon}`}
          id={titleId}
        >
          <Icon name="file-text" size={20} />
          {t.setupSheetTitle}
        </h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={handlePrint}
            style={{ display: "inline-flex", gap: "6px", alignItems: "center", padding: "6px 14px" }}
          >
            <Icon name="printer" size={16} />
            {t.printSheet}
          </button>
          <button
            className={styles.closeButton}
            type="button"
            onClick={onClose}
            data-dialog-autofocus
            aria-label={t.closeSheet}
          >
            <Icon name="x" size={24} fallback="M6 18L18 6M6 6l12 12" />
          </button>
        </div>
      </header>

      <div className={styles.sheetBody} style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Document Header Banner */}
        <div
          style={{
            background: "rgba(30, 41, 59, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            padding: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tên Dự Án / File</div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "#f8fafc", marginTop: "4px" }}>{programName}</div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Máy: {machineProfile}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.sheetCycleTime}</div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "#38bdf8", marginTop: "4px" }}>{formatTime(cutTime)}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.sheetStockSize}</div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "#f8fafc", marginTop: "4px" }}>
              {stock.width} × {stock.height} × {stock.thickness} mm
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.sheetWorkOrigin}</div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "#4ade80", marginTop: "4px" }}>
              G54 (Z0: {stock.zZero === "bottom" ? "Đáy phôi" : "Mặt trên phôi"})
            </div>
          </div>
        </div>

        {/* Machining Extents & Metrics Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>{t.sheetCutDistance}</div>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "#f8fafc", marginTop: "4px" }}>{formatLength(cutDist)}</div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>{t.sheetRapidTime}</div>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "#f8fafc", marginTop: "4px" }}>{formatLength(rapidDist)}</div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Vùng Cắt X [Min / Max]</div>
            <div style={{ fontSize: "14px", fontWeight: "500", color: "#f8fafc", marginTop: "4px" }}>
              {bounds ? `${bounds.minX.toFixed(2)} → ${bounds.maxX.toFixed(2)} mm` : "—"}
            </div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Vùng Cắt Y [Min / Max]</div>
            <div style={{ fontSize: "14px", fontWeight: "500", color: "#f8fafc", marginTop: "4px" }}>
              {bounds ? `${bounds.minY.toFixed(2)} → ${bounds.maxY.toFixed(2)} mm` : "—"}
            </div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Vùng Cắt Z [Min / Max]</div>
            <div style={{ fontSize: "14px", fontWeight: "500", color: "#f8fafc", marginTop: "4px" }}>
              {bounds ? `${bounds.minZ.toFixed(2)} → ${bounds.maxZ.toFixed(2)} mm` : "—"}
            </div>
          </div>
        </div>

        {/* Tooling Summary Table */}
        <div>
          <h3 style={{ fontSize: "13px", fontWeight: "600", color: "#cbd5e1", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "10px" }}>
            {t.sheetToolList} ({toolSummaries.length} dao)
          </h3>
          <div style={{ overflowX: "auto", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "6px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "rgba(30, 41, 59, 0.8)", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolNum}</th>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolName}</th>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolType}</th>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolDia}</th>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolZMin}</th>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolFeed}</th>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolRpm}</th>
                  <th style={{ padding: "10px 12px" }}>{t.sheetToolDist}</th>
                </tr>
              </thead>
              <tbody>
                {toolSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
                      Chưa phát hiện dao trong chương trình hiện tại.
                    </td>
                  </tr>
                ) : (
                  toolSummaries.map((tool) => (
                    <tr key={tool.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: "600", color: "#38bdf8" }}>T{tool.id}</td>
                      <td style={{ padding: "10px 12px", color: "#f1f5f9" }}>{tool.name}</td>
                      <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{tool.type}</td>
                      <td style={{ padding: "10px 12px", color: "#f1f5f9" }}>{tool.diameter} mm</td>
                      <td style={{ padding: "10px 12px", color: "#f87171" }}>{tool.minZ.toFixed(2)} mm</td>
                      <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{Math.round(tool.feedRate)} mm/min</td>
                      <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{Math.round(tool.spindleRpm)} RPM</td>
                      <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{formatLength(tool.cutLength)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Safety & Operator Checklist */}
        <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "6px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
            LƯU Ý VẬN HÀNH & AN TOÀN TRƯỚC KHI CHẠY MÁY:
          </div>
          <ul style={{ fontSize: "12px", color: "#94a3b8", margin: 0, paddingLeft: "18px", lineHeight: "1.6" }}>
            <li>Kiểm tra kẹp chặt phôi và độ cao an toàn Safe Z ({stock.safeZ} mm).</li>
            <li>Rà gá phôi và thiết lập gốc G54 trùng khớp bản vẽ.</li>
            <li>Kiểm tra nước làm mát / hút bụi trước khi bật Spindle.</li>
            <li>Chạy dry-run ở vị trí Z an toàn trước khi cắt chính thức.</li>
          </ul>
        </div>
      </div>

      <footer className={styles.footer}>
        <button className={styles.secondaryButton} type="button" onClick={onClose}>
          {t.closeSheet}
        </button>
      </footer>
    </ResponsiveDialog>
  );
}
