/**
 * Web Serial CNC Controller Client
 * Supports GRBL 1.1, FluidNC, Marlin, and standard G-code serial streaming.
 */

export type CncControllerState = "disconnected" | "connecting" | "connected" | "streaming" | "paused" | "error";

export type GrblStatus = {
  state: string; // Idle, Run, Hold, Jog, Alarm, Door, Check, Home, Sleep
  mPos: { x: number; y: number; z: number };
  wPos: { x: number; y: number; z: number };
  feedRate: number;
  spindleRpm: number;
  bufferPlanner: number;
  bufferRx: number;
  raw: string;
};

export type CncControllerListener = {
  onStateChange?: (state: CncControllerState) => void;
  onStatusUpdate?: (status: GrblStatus) => void;
  onLog?: (message: string, direction: "in" | "out" | "info" | "error") => void;
  onProgress?: (current: number, total: number) => void;
};

interface SerialPortStub {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<BufferSource> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface NavigatorWithSerial {
  serial?: {
    requestPort(): Promise<SerialPortStub>;
  };
}

export class CncSerialController {
  private port: SerialPortStub | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private readLoopActive = false;
  private state: CncControllerState = "disconnected";
  private listeners: CncControllerListener = {};
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;
  private streamQueue: string[] = [];
  private streamIndex = 0;
  private streamTotal = 0;
  private isStreamingPaused = false;
  private waitingForOk = false;

  private currentStatus: GrblStatus = {
    state: "Disconnected",
    mPos: { x: 0, y: 0, z: 0 },
    wPos: { x: 0, y: 0, z: 0 },
    feedRate: 0,
    spindleRpm: 0,
    bufferPlanner: 15,
    bufferRx: 128,
    raw: "",
  };

  constructor(listeners?: CncControllerListener) {
    if (listeners) {
      this.listeners = listeners;
    }
  }

  private setState(state: CncControllerState) {
    this.state = state;
    this.listeners.onStateChange?.(state);
  }

  private log(message: string, direction: "in" | "out" | "info" | "error") {
    this.listeners.onLog?.(message, direction);
  }

  public setListener(listener: CncControllerListener) {
    this.listeners = { ...this.listeners, ...listener };
  }

  public isSupported(): boolean {
    return typeof window !== "undefined" && "serial" in navigator;
  }

  public getState(): CncControllerState {
    return this.state;
  }

  public getStatus(): GrblStatus {
    return this.currentStatus;
  }

  public async connect(baudRate = 115200): Promise<boolean> {
    if (!this.isSupported()) {
      this.log("Trình duyệt không hỗ trợ Web Serial API. Vui lòng dùng Chrome, Edge hoặc Opera.", "error");
      return false;
    }

    try {
      this.setState("connecting");
      this.log("Đang yêu cầu kết nối cổng Serial...", "info");
      
      const navSerial = (navigator as unknown as NavigatorWithSerial).serial;
      if (!navSerial) {
        throw new Error("navigator.serial is undefined");
      }
      this.port = await navSerial.requestPort();
      await this.port.open({ baudRate });

      this.setState("connected");
      this.log(`Đã kết nối thành công tại Baud rate: ${baudRate}`, "info");

      // Start read loop
      this.readLoopActive = true;
      this.startReadLoop();

      // Start status polling (every 250ms send '?')
      this.startStatusPolling();

      // Send initial wake up
      await this.writeRaw("\r\n\r\n");
      return true;
    } catch (err: unknown) {
      this.setState("error");
      const message = err instanceof Error ? err.message : String(err);
      this.log(`Lỗi kết nối Serial: ${message}`, "error");
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    this.readLoopActive = false;
    this.stopStatusPolling();

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
    } catch {}

    try {
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch {}

    this.setState("disconnected");
    this.currentStatus.state = "Disconnected";
    this.listeners.onStatusUpdate?.(this.currentStatus);
    this.log("Đã ngắt kết nối cổng Serial.", "info");
  }

  private async startReadLoop() {
    if (!this.port || !this.port.readable) return;

    const textDecoder = new TextDecoderStream();
    void this.port.readable.pipeTo(textDecoder.writable).catch(() => undefined);
    this.reader = textDecoder.readable.getReader();

    let buffer = "";

    try {
      while (this.readLoopActive) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
              this.handleIncomingLine(trimmed);
            }
          }
        }
      }
    } catch (error: unknown) {
      if (this.readLoopActive) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Lỗi luồng đọc Serial: ${message}`, "error");
      }
    } finally {
      try {
        this.reader?.releaseLock();
      } catch {}
    }
  }

  private handleIncomingLine(line: string) {
    if (line.startsWith("<") && line.endsWith(">")) {
      // Parse GRBL status report: e.g. <Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>
      this.parseGrblStatus(line);
      return;
    }

    this.log(line, "in");

    if (this.state === "streaming" && !this.isStreamingPaused) {
      if (line === "ok" || line.startsWith("ok") || line.startsWith("error:")) {
        this.waitingForOk = false;
        this.streamNextLine();
      }
    }
  }

  private parseGrblStatus(report: string) {
    const content = report.slice(1, -1);
    const parts = content.split("|");
    const state = parts[0] || "Unknown";
    
    let mPos = { ...this.currentStatus.mPos };
    let wPos = { ...this.currentStatus.wPos };
    let feedRate = this.currentStatus.feedRate;
    let spindleRpm = this.currentStatus.spindleRpm;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith("MPos:")) {
        const coords = part.substring(5).split(",").map(Number);
        if (coords.length >= 3 && coords.every(n => Number.isFinite(n))) {
          mPos = { x: coords[0], y: coords[1], z: coords[2] };
          wPos = { ...mPos }; // fallback if WPos not sent
        }
      } else if (part.startsWith("WPos:")) {
        const coords = part.substring(5).split(",").map(Number);
        if (coords.length >= 3 && coords.every(n => Number.isFinite(n))) {
          wPos = { x: coords[0], y: coords[1], z: coords[2] };
        }
      } else if (part.startsWith("FS:")) {
        const [f, s] = part.substring(3).split(",").map(Number);
        if (Number.isFinite(f)) feedRate = f;
        if (Number.isFinite(s)) spindleRpm = s;
      }
    }

    this.currentStatus = {
      state,
      mPos,
      wPos,
      feedRate,
      spindleRpm,
      bufferPlanner: 15,
      bufferRx: 128,
      raw: report,
    };

    this.listeners.onStatusUpdate?.(this.currentStatus);
  }

  private startStatusPolling() {
    this.stopStatusPolling();
    this.statusPollTimer = setInterval(() => {
      if (this.state === "connected" || this.state === "streaming" || this.state === "paused") {
        this.writeRaw("?");
      }
    }, 300);
  }

  private stopStatusPolling() {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
  }

  public async sendCommand(cmd: string): Promise<void> {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    this.log(trimmed, "out");
    await this.writeRaw(trimmed + "\n");
  }

  private async writeRaw(data: string): Promise<void> {
    if (!this.port || !this.port.writable) return;
    try {
      const textEncoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      await writer.write(textEncoder.encode(data));
      writer.releaseLock();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`Lỗi gửi dữ liệu Serial: ${message}`, "error");
    }
  }

  // --- Real-Time GRBL Realtime Controls ---

  public async jog(axis: "X" | "Y" | "Z", distance: number, feed = 1500): Promise<void> {
    const sign = distance >= 0 ? "+" : "";
    const jogCmd = `$J=G91 G21 ${axis}${sign}${distance.toFixed(3)} F${Math.round(feed)}`;
    await this.sendCommand(jogCmd);
  }

  public async home(): Promise<void> {
    await this.sendCommand("$H");
  }

  public async unlock(): Promise<void> {
    await this.sendCommand("$X");
  }

  public async zeroAxis(axis: "X" | "Y" | "Z"): Promise<void> {
    await this.sendCommand(`G10 L20 P1 ${axis}0`);
  }

  public async zeroAllAxes(): Promise<void> {
    await this.sendCommand("G10 L20 P1 X0 Y0 Z0");
  }

  public async feedHold(): Promise<void> {
    await this.writeRaw("!"); // GRBL feed hold real-time character
    this.log("Lệnh dừng khẩn (Feed Hold: !)", "info");
  }

  public async cycleResume(): Promise<void> {
    await this.writeRaw("~"); // GRBL cycle resume real-time character
    this.log("Lệnh tiếp tục (Resume: ~)", "info");
  }

  public async softReset(): Promise<void> {
    await this.writeRaw("\x18"); // Ctrl+X soft reset
    this.log("Lệnh Khởi động lại phần mềm (Soft Reset: Ctrl+X)", "info");
    this.stopStreaming();
  }

  // --- G-code Streaming ---

  public startStreaming(gcodeLines: string[]): void {
    if (this.state !== "connected" && this.state !== "paused") return;
    this.streamQueue = gcodeLines
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("(") && !l.startsWith(";"));
    
    this.streamIndex = 0;
    this.streamTotal = this.streamQueue.length;
    this.isStreamingPaused = false;
    this.waitingForOk = false;
    this.setState("streaming");
    this.log(`Bắt đầu truyền G-code: ${this.streamTotal} dòng lệnh.`, "info");
    this.streamNextLine();
  }

  public pauseStreaming(): void {
    if (this.state === "streaming") {
      this.isStreamingPaused = true;
      this.setState("paused");
      this.feedHold();
    }
  }

  public resumeStreaming(): void {
    if (this.state === "paused") {
      this.isStreamingPaused = false;
      this.setState("streaming");
      this.cycleResume();
      if (!this.waitingForOk) {
        this.streamNextLine();
      }
    }
  }

  public stopStreaming(): void {
    this.streamQueue = [];
    this.streamIndex = 0;
    this.streamTotal = 0;
    this.isStreamingPaused = false;
    this.waitingForOk = false;
    if (this.state === "streaming" || this.state === "paused") {
      this.setState("connected");
    }
    this.listeners.onProgress?.(0, 0);
  }

  private async streamNextLine(): Promise<void> {
    if (this.isStreamingPaused || this.state !== "streaming") return;

    if (this.streamIndex >= this.streamTotal) {
      this.log("Truyền chương trình G-code hoàn tất 100%!", "info");
      this.stopStreaming();
      return;
    }

    const line = this.streamQueue[this.streamIndex];
    this.streamIndex++;
    this.waitingForOk = true;
    this.listeners.onProgress?.(this.streamIndex, this.streamTotal);
    this.log(`[${this.streamIndex}/${this.streamTotal}] ${line}`, "out");
    await this.writeRaw(line + "\n");
  }
}
