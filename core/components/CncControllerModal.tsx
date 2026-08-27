import { useEffect, useId, useRef, useState } from "react";
import type { TranslationDict } from "../../app/i18n";
import { Icon } from "./ui/Icon";
import { ResponsiveDialog } from "./ui/ResponsiveDialog";
import {
  CncSerialController,
  type CncControllerState,
  type GrblStatus,
} from "../controllers/web-serial";
import styles from "./ui/ResponsiveDialog.module.css";

interface CncControllerModalProps {
  t: TranslationDict;
  gcode: string;
  onClose: () => void;
}

interface LogMessage {
  id: number;
  text: string;
  type: "in" | "out" | "info" | "error";
  time: string;
}

export function CncControllerModal({ t, gcode, onClose }: CncControllerModalProps) {
  const titleId = useId();
  const [baudRate, setBaudRate] = useState(115200);
  const [stepSize, setStepSize] = useState<number>(1.0);
  const [jogFeed, setJogFeed] = useState<number>(1500);
  const [controllerState, setControllerState] = useState<CncControllerState>("disconnected");
  const [status, setStatus] = useState<GrblStatus>({
    state: "Disconnected",
    mPos: { x: 0, y: 0, z: 0 },
    wPos: { x: 0, y: 0, z: 0 },
    feedRate: 0,
    spindleRpm: 0,
    bufferPlanner: 15,
    bufferRx: 128,
    raw: "",
  });
  const [streamProgress, setStreamProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [customCmd, setCustomCmd] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CncSerialController | null>(null);

  useEffect(() => {
    const controller = new CncSerialController({
      onStateChange: (state) => setControllerState(state),
      onStatusUpdate: (st) => setStatus({ ...st }),
      onLog: (text, type) => {
        const time = new Date().toLocaleTimeString();
        setLogs((prev) => [...prev.slice(-100), { id: Date.now() + Math.random(), text, type, time }]);
      },
      onProgress: (current, total) => setStreamProgress({ current, total }),
    });

    controllerRef.current = controller;

    return () => {
      // Clean up when closing modal
      if (controller.getState() === "connected" || controller.getState() === "streaming") {
        controller.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleConnect = async () => {
    if (!controllerRef.current) return;
    if (controllerState === "connected" || controllerState === "streaming" || controllerState === "paused") {
      await controllerRef.current.disconnect();
    } else {
      await controllerRef.current.connect(baudRate);
    }
  };

  const handleJog = (axis: "X" | "Y" | "Z", dir: number) => {
    controllerRef.current?.jog(axis, dir * stepSize, jogFeed);
  };

  const handleZeroAxis = (axis: "X" | "Y" | "Z") => {
    controllerRef.current?.zeroAxis(axis);
  };

  const handleZeroAll = () => {
    controllerRef.current?.zeroAllAxes();
  };

  const handleHome = () => {
    controllerRef.current?.home();
  };

  const handleUnlock = () => {
    controllerRef.current?.unlock();
  };

  const handleReset = () => {
    controllerRef.current?.softReset();
  };

  const handleStartStream = () => {
    if (!gcode.trim()) return;
    const lines = gcode.split(/\r?\n/);
    controllerRef.current?.startStreaming(lines);
  };

  const handlePauseStream = () => {
    controllerRef.current?.pauseStreaming();
  };

  const handleResumeStream = () => {
    controllerRef.current?.resumeStreaming();
  };

  const handleStopStream = () => {
    controllerRef.current?.stopStreaming();
  };

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCmd.trim() || !controllerRef.current) return;
    controllerRef.current.sendCommand(customCmd);
    setCustomCmd("");
  };

  const isConnected = controllerState === "connected" || controllerState === "streaming" || controllerState === "paused";
  const isStreaming = controllerState === "streaming";
  const isPaused = controllerState === "paused";
  const isWebSerialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const stateBadgeColor =
    status.state === "Idle"
      ? "#22c55e"
      : status.state === "Run" || status.state === "Jog"
        ? "#3b82f6"
        : status.state === "Hold"
          ? "#f59e0b"
          : status.state === "Alarm"
            ? "#ef4444"
            : "#94a3b8";

  return (
    <ResponsiveDialog
      onClose={onClose}
      titleId={titleId}
      size="large"
      height="auto"
    >
      <header className={styles.header}>
        <h2 className={`${styles.heading} ${styles.headingWithIcon}`} id={titleId}>
          <Icon name="usb" size={20} />
          {t.controllerTitle}
        </h2>
        <button
          className={styles.closeButton}
          type="button"
          onClick={onClose}
          data-dialog-autofocus
          aria-label="Đóng"
        >
          <Icon name="x" size={24} fallback="M6 18L18 6M6 6l12 12" />
        </button>
      </header>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {!isWebSerialSupported && (
          <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "6px", padding: "12px", color: "#fca5a5", fontSize: "13px" }}>
            {t.serialUnsupported}
          </div>
        )}

        {/* Connection Bar */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", background: "rgba(30, 41, 59, 0.6)", padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "#cbd5e1" }}>{t.serialBaudRate}:</span>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              disabled={isConnected}
              style={{ background: "#0f172a", color: "#f8fafc", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "4px", padding: "4px 8px", fontSize: "13px" }}
            >
              <option value={115200}>115200 (GRBL 1.1)</option>
              <option value={250000}>250000 (Marlin/3D)</option>
              <option value={57600}>57600</option>
              <option value={9600}>9600</option>
            </select>
          </div>

          <button
            type="button"
            className={isConnected ? styles.secondaryButton : styles.primaryButton}
            onClick={handleConnect}
            style={{ display: "inline-flex", gap: "6px", alignItems: "center", padding: "6px 16px", fontWeight: "600" }}
          >
            <Icon name="usb" size={16} />
            {isConnected ? t.serialDisconnect : t.serialConnect}
          </button>

          {/* Status Badge */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Trạng thái máy:</span>
            <span style={{ background: stateBadgeColor, color: "#ffffff", padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" }}>
              {status.state}
            </span>
          </div>
        </div>

        {/* Live DRO (Digital Readout) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          <div style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "6px", padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "#38bdf8", fontWeight: "700" }}>TRỤC X (G54)</div>
            <div style={{ fontSize: "22px", fontFamily: "monospace", fontWeight: "700", color: "#f8fafc", marginTop: "2px" }}>
              {status.wPos.x.toFixed(3)}
            </div>
            <div style={{ fontSize: "10px", color: "#64748b" }}>MPos: {status.mPos.x.toFixed(3)}</div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(74, 222, 128, 0.2)", borderRadius: "6px", padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "#4ade80", fontWeight: "700" }}>TRỤC Y (G54)</div>
            <div style={{ fontSize: "22px", fontFamily: "monospace", fontWeight: "700", color: "#f8fafc", marginTop: "2px" }}>
              {status.wPos.y.toFixed(3)}
            </div>
            <div style={{ fontSize: "10px", color: "#64748b" }}>MPos: {status.mPos.y.toFixed(3)}</div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(248, 113, 113, 0.2)", borderRadius: "6px", padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "#f87171", fontWeight: "700" }}>TRỤC Z (G54)</div>
            <div style={{ fontSize: "22px", fontFamily: "monospace", fontWeight: "700", color: "#f8fafc", marginTop: "2px" }}>
              {status.wPos.z.toFixed(3)}
            </div>
            <div style={{ fontSize: "10px", color: "#64748b" }}>MPos: {status.mPos.z.toFixed(3)}</div>
          </div>
        </div>

        {/* Middle Area: Jog Controls & Streaming Controller */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {/* Jog Pad */}
          <div style={{ background: "rgba(30, 41, 59, 0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: "600", color: "#cbd5e1", textTransform: "uppercase", marginBottom: "10px" }}>
              {t.serialJog}
            </div>

            {/* Step Size Selector */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              {[0.1, 1.0, 10.0, 50.0].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setStepSize(step)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: stepSize === step ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                    background: stepSize === step ? "#0284c7" : "#0f172a",
                    color: "#f8fafc",
                    fontWeight: stepSize === step ? "700" : "400",
                    cursor: "pointer",
                  }}
                >
                  {step} mm
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", fontSize: "12px", color: "#94a3b8" }}>
              <span>Tốc độ Jog:</span>
              <div style={{ display: "flex", gap: "4px" }}>
                {[500, 1500, 3000].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setJogFeed(f)}
                    style={{
                      padding: "2px 6px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: jogFeed === f ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                      background: jogFeed === f ? "#0284c7" : "#0f172a",
                      color: "#f8fafc",
                      cursor: "pointer",
                    }}
                  >
                    F{f}
                  </button>
                ))}
              </div>
            </div>

            {/* 3x3 XY Jog Pad + Z Column */}
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", alignItems: "center" }}>
              {/* XY Cross */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 46px)", gridTemplateRows: "repeat(3, 46px)", gap: "6px" }}>
                <div />
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => handleJog("Y", 1)}
                  style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="Y+ (Lên)"
                >
                  Y+
                </button>
                <div />

                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => handleJog("X", -1)}
                  style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="X- (Trái)"
                >
                  X-
                </button>
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={handleZeroAll}
                  style={{ background: "#0369a1", border: "1px solid #38bdf8", borderRadius: "6px", color: "#ffffff", fontSize: "10px", fontWeight: "700", cursor: "pointer" }}
                  title="Set Zero All"
                >
                  ZERO
                </button>
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => handleJog("X", 1)}
                  style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="X+ (Phải)"
                >
                  X+
                </button>

                <div />
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => handleJog("Y", -1)}
                  style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="Y- (Xuống)"
                >
                  Y-
                </button>
                <div />
              </div>

              {/* Z Jog Column */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => handleJog("Z", 1)}
                  style={{ width: "46px", height: "46px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600" }}
                  title="Z+ (Nâng dao)"
                >
                  Z+
                </button>
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => handleZeroAxis("Z")}
                  style={{ width: "46px", height: "46px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#f87171", fontSize: "10px", fontWeight: "700", cursor: "pointer" }}
                  title="Set Zero Z"
                >
                  Z=0
                </button>
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => handleJog("Z", -1)}
                  style={{ width: "46px", height: "46px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600" }}
                  title="Z- (Hạ dao)"
                >
                  Z-
                </button>
              </div>
            </div>

            {/* Quick CNC Machine Commands */}
            <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
              <button
                type="button"
                disabled={!isConnected}
                onClick={handleHome}
                style={{ flex: 1, padding: "6px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#38bdf8", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
              >
                {t.serialHome}
              </button>
              <button
                type="button"
                disabled={!isConnected}
                onClick={handleUnlock}
                style={{ flex: 1, padding: "6px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#facc15", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
              >
                {t.serialUnlock}
              </button>
              <button
                type="button"
                disabled={!isConnected}
                onClick={handleReset}
                style={{ flex: 1, padding: "6px", background: "#450a0a", border: "1px solid #ef4444", borderRadius: "4px", color: "#fca5a5", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
              >
                {t.serialReset}
              </button>
            </div>
          </div>

          {/* G-code Streamer & Progress */}
          <div style={{ background: "rgba(30, 41, 59, 0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "12px", fontWeight: "600", color: "#cbd5e1", textTransform: "uppercase" }}>
              {t.serialStream}
            </div>

            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              Tiến độ: <strong style={{ color: "#f8fafc" }}>{streamProgress.current}</strong> / {streamProgress.total} dòng lệnh
            </div>

            {/* Progress Bar */}
            <div style={{ height: "10px", background: "#0f172a", borderRadius: "999px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div
                style={{
                  height: "100%",
                  width: `${streamProgress.total > 0 ? (streamProgress.current / streamProgress.total) * 100 : 0}%`,
                  background: "linear-gradient(90deg, #0284c7, #38bdf8)",
                  transition: "width 0.1s ease",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
              {!isStreaming && !isPaused ? (
                <button
                  type="button"
                  disabled={!isConnected || !gcode.trim()}
                  onClick={handleStartStream}
                  className={styles.primaryButton}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <Icon name="play" size={16} />
                  {t.serialStream}
                </button>
              ) : isStreaming ? (
                <>
                  <button
                    type="button"
                    onClick={handlePauseStream}
                    style={{ flex: 1, padding: "8px", background: "#ca8a04", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <Icon name="pause" size={16} />
                    {t.serialPause}
                  </button>
                  <button
                    type="button"
                    onClick={handleStopStream}
                    style={{ flex: 1, padding: "8px", background: "#b91c1c", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <Icon name="stop" size={16} />
                    {t.serialStop}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleResumeStream}
                    style={{ flex: 1, padding: "8px", background: "#16a34a", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <Icon name="play" size={16} />
                    {t.serialResume}
                  </button>
                  <button
                    type="button"
                    onClick={handleStopStream}
                    style={{ flex: 1, padding: "8px", background: "#b91c1c", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <Icon name="stop" size={16} />
                    {t.serialStop}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Serial Terminal Log */}
        <div style={{ background: "#090d16", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", overflow: "hidden" }}>
          <div style={{ background: "rgba(30, 41, 59, 0.8)", padding: "6px 12px", fontSize: "11px", fontWeight: "600", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="terminal" size={14} />
            {t.serialTerminal}
          </div>
          <div
            ref={logContainerRef}
            style={{
              height: "120px",
              overflowY: "auto",
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#475569" }}>Chưa có log từ cổng Serial. Nhấn &apos;Kết nối Cổng COM&apos; để bắt đầu.</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    color:
                      log.type === "out"
                        ? "#38bdf8"
                        : log.type === "in"
                          ? "#4ade80"
                          : log.type === "error"
                            ? "#f87171"
                            : "#94a3b8",
                  }}
                >
                  <span style={{ color: "#475569", marginRight: "6px" }}>[{log.time}]</span>
                  <span>{log.type === "out" ? "➔ " : log.type === "in" ? "⬅ " : "ℹ "}</span>
                  {log.text}
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendCommand} style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              type="text"
              placeholder="Nhập lệnh G-code / GRBL (VD: G0 X10 Y10, $$, ?)..."
              value={customCmd}
              disabled={!isConnected}
              onChange={(e) => setCustomCmd(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none", padding: "8px 12px", color: "#f8fafc", fontSize: "12px", fontFamily: "monospace", outline: "none" }}
            />
            <button
              type="submit"
              disabled={!isConnected || !customCmd.trim()}
              style={{ background: "#1e293b", border: "none", color: "#38bdf8", padding: "0 16px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
            >
              {t.serialSend}
            </button>
          </form>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
