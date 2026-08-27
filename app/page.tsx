"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  loadMachineSimulatorModule,
  loadSolidSimulatorModule,
  ToolpathCanvas,
} from "@/core/components/ToolpathCanvas";

import {
  DEFAULT_STOCK,
  exportCAM,
  generateSmartResume,
  orientStockForProgram,
  resizeStockPreservingPinnedOrigin,
} from "@/core/simulation/studio-program";
import {
  prepareProgramOffThread,
  useProgramAnalysis,
} from "@/core/ui/use-program-analysis";
import { renderPerformanceProfile } from "@/core/simulation/render-performance";
import {
  MAX_PROGRAM_BYTES,
  MAX_PROGRAM_LINES,
  programLimitViolation,
} from "@/core/simulation/program-limits";
import { SAMPLE_GCODE } from "@/core/simulation/sample-program";
import { resolveVBitGeometry } from "@/core/simulation/stock-removal-coordinates";
import type {
  Axis,
  CoordinateSystem,
} from "@/core/gcode/types";
import type {
  PostProcessorType,
  StockSettings,
  StudioMachineProfile as MachineProfile,
} from "@/core/simulation/types";
import {
  Lang,
  translateDiagnostic,
  translations,
} from "./i18n";
import { cncAudio } from "@/core/simulation/audio";
import { UserGuideModal } from "@/core/components/UserGuideModal";
import { FileCompareModal } from "@/core/components/FileCompareModal";
import { MiniCamModal } from "@/core/components/MiniCamModal";
import { JobSetupSheetModal } from "@/core/components/JobSetupSheetModal";
import { CncControllerModal } from "@/core/components/CncControllerModal";
import { GcodeEditor } from "@/core/components/GcodeEditor";
import {
  WORKSPACE_PREFERENCES_KEY,
  cloneStockSettings,
  cloneWorkspaceWorkOffsets,
  createZeroWorkspaceWorkOffsets,
  parseWorkspacePreferences,
  serializeWorkspacePreferences,
  type SimulationQuality,
  type WorkspacePreferences,
} from "@/core/ui/workspace-preferences";
import {
  createWorkOffsetInputDraft,
  parseWorkOffsetInput,
  parseWorkOffsetInputDraft,
} from "@/core/ui/work-offset-input";

import { Icon } from "@/core/components/ui/Icon";
import { MetricCard } from "@/core/components/ui/MetricCard";
import { ToolbarButton } from "@/core/components/ui/ToolbarButton";
import { ResponsiveDialog } from "@/core/components/ui/ResponsiveDialog";
import { 
  ViewMode, 
  OrbitCamera, 
  getViewMeta, 
  pointOnSegmentInTelemetryCoordinates,
  pointInProgramUnits,
  formatTime, 
  formatLength
} from "@/core/utils/gcode-utils";

const DEFAULT_ORBIT: OrbitCamera = {
  yaw: Math.PI / 4,
  pitch: Math.PI / 5.2,
};

const PLANE_GCODE = { XY: "G17", XZ: "G18", YZ: "G19" } as const;
const MACHINE_VIEW_STORAGE_KEY = "lax_cnc_experimental_machine_view";
const CODE_ROW_HEIGHT = 28;
const CODE_OVERSCAN_ROWS = 18;
const WORK_COORDINATE_SYSTEMS = [
  "G54",
  "G55",
  "G56",
  "G57",
  "G58",
  "G59",
] as const satisfies readonly CoordinateSystem[];
const SURFACE_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type MobileWorkspacePanel = "simulation" | "code";

function getSurfaceFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(SURFACE_FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      !element.hasAttribute("hidden") &&
      element.getClientRects().length > 0,
  );
}

function createDefaultWorkspacePreferences(): WorkspacePreferences {
  return {
    version: 1,
    profile: "router-custom",
    stock: cloneStockSettings(DEFAULT_STOCK),
    speed: 2,
    quality: "medium",
    showRapids: true,
    machineSound: false,
    finishSound: true,
    workOffsets: createZeroWorkspaceWorkOffsets(),
  };
}

function isInvalidStockField(
  key: keyof StockSettings,
  value: number,
) {
  if (!Number.isFinite(value)) return true;
  if (
    key === "width" ||
    key === "height" ||
    key === "thickness" ||
    key === "toolDiameter" ||
    key === "rapidFeed"
  ) {
    return value <= 0;
  }
  return key === "clearance" && value < 0;
}


function syntaxLine(line: string) {
  const chunks = line.split(
    /(\([^)]*\)|;.*$|[GM]\d+(?:\.\d+)?|[XYZIJKRQUVWABC][-+]?(?:\d+(?:\.\d*)?|\.\d+)|[FST][-+]?(?:\d+(?:\.\d*)?|\.\d+))/gi,
  );
  return chunks.map((chunk, index) => {
    let className = "";
    if (/^\(|^;/.test(chunk)) className = "syntax-comment";
    else if (/^G/i.test(chunk)) className = "syntax-g";
    else if (/^M/i.test(chunk)) className = "syntax-m";
    else if (/^[XYZIJKRQUVWABC]/i.test(chunk)) className = "syntax-axis";
    else if (/^[FST]/i.test(chunk)) className = "syntax-value";
    return (
      <span className={className} key={`${index}-${chunk}`}>
        {chunk}
      </span>
    );
  });
}




export default function Home() {
  const [code, setCode] = useState(SAMPLE_GCODE);
  const [draftCode, setDraftCode] = useState(SAMPLE_GCODE);
  const [fileName, setFileName] = useState("tu-bep-can-a01.nc");
  const [projectName, setProjectName] = useState("Tủ bếp căn A-01");
  const [stock, setStock] = useState(DEFAULT_STOCK);
  const [profile, setProfile] = useState<MachineProfile>("router-custom");
  const [workOffsets, setWorkOffsets] = useState(
    createZeroWorkspaceWorkOffsets,
  );
  const [lang, setLang] = useState<Lang>("VN");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("lax_cnc_lang");
    } catch {
      // Private browsing/storage policies must not prevent the app from mounting.
    }
    if (saved !== "EN" && saved !== "VN") return;

    const frame = window.requestAnimationFrame(() => setLang(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleLanguage = useCallback((newLang: Lang) => {
    setLang(newLang);
    try {
      localStorage.setItem("lax_cnc_lang", newLang);
    } catch {
      // Language still changes for this session when storage is unavailable.
    }
  }, []);

  const t = translations[lang];
  const [view, setView] = useState<ViewMode>("xoy");
  const [machineViewEnabled, setMachineViewEnabled] = useState(false);
  const [mobilePanel, setMobilePanel] =
    useState<MobileWorkspacePanel>("simulation");
  const [cursor, setCursor] = useState(0);
  const [focusedCodeLine, setFocusedCodeLine] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [quality, setQuality] = useState<SimulationQuality>("medium");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [orbit, setOrbit] = useState<OrbitCamera>({ ...DEFAULT_ORBIT });
  const [showRapids, setShowRapids] = useState(true);
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementSession, setMeasurementSession] = useState(0);
  const [simulatorExpanded, setSimulatorExpanded] = useState(false);
  const [drawer, setDrawer] = useState<
    "diagnostics" | "parts" | "offcuts" | "resume" | "export" | null
  >(null);
  const [resumeSegment, setResumeSegment] = useState(5);
  const [resumeSafeZ, setResumeSafeZ] = useState(50);
  const [exportType, setExportType] = useState<PostProcessorType>("ncstudio");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"stock" | "tools" | "safety" | "preferences">("stock");
  const [settingsDraft, setSettingsDraft] = useState<WorkspacePreferences>(
    createDefaultWorkspacePreferences,
  );
  const [workOffsetInputDraft, setWorkOffsetInputDraft] = useState(() =>
    createWorkOffsetInputDraft(createZeroWorkspaceWorkOffsets()),
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [minicamOpen, setMinicamOpen] = useState(false);
  const [setupSheetOpen, setSetupSheetOpen] = useState(false);
  const [cncControllerOpen, setCncControllerOpen] = useState(false);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());

  const toggleBreakpoint = useCallback((lineNum: number) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(lineNum)) {
        next.delete(lineNum);
      } else {
        next.add(lineNum);
      }
      return next;
    });
  }, []);

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreparingProgram, setIsPreparingProgram] = useState(false);
  const [codeViewport, setCodeViewport] = useState({
    scrollTop: 0,
    height: 600,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [machineSound, setMachineSound] = useState(false);
  const [finishSound, setFinishSound] = useState(true);
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const [soundMenuPosition, setSoundMenuPosition] = useState({ left: 8, top: 8 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const soundButtonRef = useRef<HTMLButtonElement>(null);
  const soundPopoverRef = useRef<HTMLDivElement>(null);
  const preferencesHydratedRef = useRef(false);
  const dragDepthRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const drawerWasOpenRef = useRef(false);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const applyCodeRequestRef = useRef(0);
  const prepareAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;

    const warmSimulatorChunks = () => {
      void loadSolidSimulatorModule().catch(() => undefined);
      if (machineViewEnabled) {
        void loadMachineSimulatorModule().catch(() => undefined);
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: Window["requestIdleCallback"];
      cancelIdleCallback?: Window["cancelIdleCallback"];
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleCallback = idleWindow.requestIdleCallback(warmSimulatorChunks, {
        timeout: 4_000,
      });
      return () => idleWindow.cancelIdleCallback?.(idleCallback);
    }

    const timeout = window.setTimeout(warmSimulatorChunks, 1_500);
    return () => window.clearTimeout(timeout);
  }, [machineViewEnabled]);

  useEffect(() => {
    let saved: WorkspacePreferences | null = null;
    try {
      saved = parseWorkspacePreferences(
        localStorage.getItem(WORKSPACE_PREFERENCES_KEY),
      );
    } catch {
      // Invalid or blocked storage falls back to safe workstation defaults.
    }
    const frame = window.requestAnimationFrame(() => {
      if (saved) {
        const restoredStock = cloneStockSettings(saved.stock);
        const orientedStock = orientStockForProgram(
          SAMPLE_GCODE,
          restoredStock,
          saved.profile,
          saved.workOffsets,
        ).stock;
        setStock(orientedStock);
        setProfile(saved.profile);
        setSpeed(saved.speed);
        setQuality(saved.quality);
        setShowRapids(saved.showRapids);
        setMachineSound(saved.machineSound);
        setFinishSound(saved.finishSound);
        setWorkOffsets(cloneWorkspaceWorkOffsets(saved.workOffsets));
      }
      preferencesHydratedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!preferencesHydratedRef.current) return;
    const preferences: WorkspacePreferences = {
      version: 1,
      profile,
      stock: cloneStockSettings(stock),
      speed,
      quality,
      showRapids,
      machineSound,
      finishSound,
      workOffsets: cloneWorkspaceWorkOffsets(workOffsets),
    };
    try {
      localStorage.setItem(
        WORKSPACE_PREFERENCES_KEY,
        serializeWorkspacePreferences(preferences),
      );
    } catch {
      // The workstation remains usable when storage is unavailable or full.
    }
  }, [
    finishSound,
    machineSound,
    profile,
    quality,
    showRapids,
    speed,
    stock,
    workOffsets,
  ]);

  useEffect(() => {
    document.documentElement.lang = lang === "EN" ? "en" : "vi";
  }, [lang]);

  useEffect(() => {
    if (drawer && !drawerWasOpenRef.current) {
      drawerReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const frame = window.requestAnimationFrame(() =>
        document.getElementById(`drawer-tab-${drawer}`)?.focus(),
      );
      drawerWasOpenRef.current = true;
      return () => window.cancelAnimationFrame(frame);
    }
    if (!drawer && drawerWasOpenRef.current) {
      drawerWasOpenRef.current = false;
      if (
        settingsOpen ||
        editorOpen ||
        compareOpen ||
        minicamOpen ||
        isGuideOpen
      ) {
        return;
      }
      const frame = window.requestAnimationFrame(() =>
        drawerReturnFocusRef.current?.focus({ preventScroll: true }),
      );
      return () => window.cancelAnimationFrame(frame);
    }
  }, [compareOpen, drawer, editorOpen, isGuideOpen, minicamOpen, settingsOpen]);

  const drawerOpen = drawer !== null;
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const trapDrawerFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = getSurfaceFocusableElements(drawerRef.current);
      if (!focusable.length) {
        event.preventDefault();
        drawerRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === drawerRef.current)
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", trapDrawerFocus, true);
    return () => {
      document.removeEventListener("keydown", trapDrawerFocus, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const {
    simulation,
    isProcessing: isSimulationProcessing,
    error: simulationProcessingError,
    cancel: cancelSimulationProcessing,
    acceptPrepared: acceptPreparedSimulation,
  } = useProgramAnalysis({ source: code, stock, profile, workOffsets });
  const analysisBusy = isPreparingProgram || isSimulationProcessing;
  const cancelProgramAnalysis = useCallback(() => {
    applyCodeRequestRef.current += 1;
    prepareAbortRef.current?.abort();
    prepareAbortRef.current = null;
    setIsPreparingProgram(false);
    cancelSimulationProcessing();
  }, [cancelSimulationProcessing]);

  const errorCount = simulation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = simulation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  ).length;
  const activeSegment =
    simulation.segments[Math.min(cursor, Math.max(0, simulation.segments.length - 1))];
  const activeUnits = activeSegment?.units ?? simulation.finalState.units;
  const currentPositionMm = activeSegment
    ? pointOnSegmentInTelemetryCoordinates(activeSegment, segmentProgress)
    : { x: stock.originX, y: stock.originY, z: stock.safeZ };
  const currentPosition = pointInProgramUnits(currentPositionMm, activeUnits);
  const activeCoordinateSystem =
    activeSegment?.coordinateSystem ?? simulation.finalState.coordinateSystem;
  const activeCoordinateLabel = activeSegment?.machineCoordinates
    ? "MACHINE · G53"
    : activeCoordinateSystem;
  const activeModeLabel = activeSegment?.machineCoordinates
    ? `G53 MCS · ${activeCoordinateSystem} ACTIVE`
    : activeCoordinateSystem;
  const activeDistanceMode = activeSegment?.machineCoordinates
    ? "absolute"
    : activeSegment?.distanceMode ??
      (simulation.finalState.absolute ? "absolute" : "incremental");
  const activeDistanceCodeLabel = activeSegment?.machineCoordinates
    ? "ABS MACHINE"
    : activeDistanceMode === "absolute"
      ? "G90 ABS"
      : "G91 INC";
  const activeDistanceFooterLabel = activeSegment?.machineCoordinates
    ? "ABS · G53"
    : activeDistanceMode === "absolute"
      ? "ABS · G90"
      : "INC · G91";
  const activePlane = activeSegment?.plane ?? simulation.finalState.plane;
  const currentLine = activeSegment?.lineIndex ?? 0;
  const totalProgress = simulation.segments.length
    ? Math.max(
        0,
        Math.min(
          100,
          ((Math.min(cursor, simulation.segments.length) + segmentProgress) /
            simulation.segments.length) *
            100,
        ),
      )
    : 0;
  const visibleCodeRange = useMemo(() => {
    const firstVisible = Math.floor(codeViewport.scrollTop / CODE_ROW_HEIGHT);
    const visibleRows = Math.ceil(codeViewport.height / CODE_ROW_HEIGHT);
    const start = Math.max(0, firstVisible - CODE_OVERSCAN_ROWS);
    const end = Math.min(
      simulation.lines.length,
      firstVisible + visibleRows + CODE_OVERSCAN_ROWS,
    );
    return { start, end };
  }, [codeViewport.height, codeViewport.scrollTop, simulation.lines.length]);

  useEffect(() => {
    const container = codeScrollRef.current;
    if (!container) return;
    const updateViewport = () => {
      setCodeViewport({
        scrollTop: container.scrollTop,
        height: container.clientHeight,
      });
    };
    const observer = new ResizeObserver(updateViewport);
    container.addEventListener("scroll", updateViewport, { passive: true });
    observer.observe(container);
    updateViewport();
    return () => {
      container.removeEventListener("scroll", updateViewport);
      observer.disconnect();
    };
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      prepareAbortRef.current?.abort();
    },
    [],
  );

  const copyText = useCallback(
    async (value: string, successMessage: string) => {
      try {
        if (!navigator.clipboard) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(value);
        notify(successMessage);
      } catch {
        notify(t.copyErrorMsg);
      }
    },
    [notify, t.copyErrorMsg],
  );

  const ensureAudio = useCallback(async () => {
    try {
      await cncAudio.init();
      return true;
    } catch {
      return false;
    }
  }, []);

  const positionSoundMenu = useCallback(() => {
    const anchor = soundButtonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const padding = 8;
    const popoverWidth = 180;
    const popoverHeight = 116;
    const left = Math.max(
      padding,
      Math.min(
        window.innerWidth - popoverWidth - padding,
        rect.left + rect.width / 2 - popoverWidth / 2,
      ),
    );
    const below = rect.bottom + padding;
    const top =
      below + popoverHeight <= window.innerHeight - padding
        ? below
        : Math.max(padding, rect.top - popoverHeight - padding);
    setSoundMenuPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!soundMenuOpen) return;
    positionSoundMenu();

    const handleViewportChange = () => positionSoundMenu();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        (target && soundButtonRef.current?.contains(target)) ||
        (target && soundPopoverRef.current?.contains(target))
      ) {
        return;
      }
      setSoundMenuOpen(false);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [positionSoundMenu, soundMenuOpen]);

  const resetPlayback = useCallback(() => {
    setPlaying(false);
    setCursor(0);
    setSegmentProgress(0);
    cncAudio.stopAll();
  }, []);

  const openSettings = useCallback(() => {
    const nextWorkOffsets = cloneWorkspaceWorkOffsets(workOffsets);
    setSettingsDraft({
      version: 1,
      profile,
      stock: cloneStockSettings(stock),
      speed,
      quality,
      showRapids,
      machineSound,
      finishSound,
      workOffsets: nextWorkOffsets,
    });
    setWorkOffsetInputDraft(createWorkOffsetInputDraft(nextWorkOffsets));
    setDrawer(null);
    setSoundMenuOpen(false);
    setSettingsOpen(true);
  }, [
    finishSound,
    machineSound,
    profile,
    quality,
    showRapids,
    speed,
    stock,
    workOffsets,
  ]);

  const updateDraftStock = useCallback(
    (update: (current: StockSettings) => StockSettings) => {
      setSettingsDraft((current) => ({
        ...current,
        stock: update(current.stock),
      }));
    },
    [],
  );

  const updateDraftWorkOffset = useCallback(
    (coordinateSystem: CoordinateSystem, axis: Axis, value: string) => {
      setWorkOffsetInputDraft((current) => ({
        ...current,
        [coordinateSystem]: {
          ...current[coordinateSystem],
          [axis]: value,
        },
      }));
    },
    [],
  );

  const applySettings = useCallback(async () => {
    const parsedWorkOffsets = parseWorkOffsetInputDraft(workOffsetInputDraft);
    if (!parsedWorkOffsets) {
      notify(t.invalidSettingsMsg);
      return;
    }
    const nextSettingsDraft: WorkspacePreferences = {
      ...settingsDraft,
      workOffsets: parsedWorkOffsets,
    };
    try {
      serializeWorkspacePreferences(nextSettingsDraft);
    } catch {
      notify(t.invalidSettingsMsg);
      return;
    }
    let nextMachineSound = nextSettingsDraft.machineSound;
    let nextFinishSound = nextSettingsDraft.finishSound;
    let audioReady = true;
    if (nextMachineSound || nextFinishSound) {
      audioReady = await ensureAudio();
      if (!audioReady) {
        nextMachineSound = false;
        nextFinishSound = false;
      }
    }

    setStock(cloneStockSettings(nextSettingsDraft.stock));
    setProfile(nextSettingsDraft.profile);
    setSpeed(nextSettingsDraft.speed);
    setQuality(nextSettingsDraft.quality);
    setShowRapids(nextSettingsDraft.showRapids);
    setMachineSound(nextMachineSound);
    setFinishSound(nextFinishSound);
    setWorkOffsets(cloneWorkspaceWorkOffsets(parsedWorkOffsets));
    setSettingsOpen(false);
    resetPlayback();
    notify(
      audioReady
        ? t.settingsAppliedMsg
        : `${t.settingsAppliedMsg} ${t.audioUnavailableMsg}`,
    );
  }, [
    ensureAudio,
    notify,
    resetPlayback,
    settingsDraft,
    t.audioUnavailableMsg,
    t.invalidSettingsMsg,
    t.settingsAppliedMsg,
    workOffsetInputDraft,
  ]);

  const onResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setOrbit({ ...DEFAULT_ORBIT });
    setResetTrigger((prev) => prev + 1);
  }, []);

  const changeView = useCallback((nextView: ViewMode) => {
    setView(nextView);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (nextView !== "solid") setIsMeasuring(false);
    if (nextView === "iso") setOrbit({ ...DEFAULT_ORBIT });
  }, []);

  useEffect(() => {
    let enabled = false;
    try {
      enabled = localStorage.getItem(MACHINE_VIEW_STORAGE_KEY) === "true";
    } catch {
      // Experimental features remain disabled when storage is unavailable.
    }
    if (!enabled) return;

    const frame = window.requestAnimationFrame(() => setMachineViewEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const availableViewModes = useMemo<ViewMode[]>(
    () =>
      machineViewEnabled
        ? ["xoy", "solid", "machine"]
        : ["xoy", "solid"],
    [machineViewEnabled],
  );

  const toggleMachineView = useCallback(
    (enabled: boolean) => {
      setMachineViewEnabled(enabled);
      try {
        localStorage.setItem(MACHINE_VIEW_STORAGE_KEY, String(enabled));
      } catch {
        // The switch still applies for this session when storage is unavailable.
      }
      if (!enabled && view === "machine") changeView("solid");
      notify(enabled ? t.machine3DEnableMsg : t.machine3DDisableMsg);
    },
    [changeView, notify, t.machine3DDisableMsg, t.machine3DEnableMsg, view],
  );

  const toggleMeasurement = useCallback(() => {
    if (isMeasuring) {
      setIsMeasuring(false);
      return;
    }

    changeView("solid");
    setMeasurementSession((session) => session + 1);
    setIsMeasuring(true);
    notify(
      lang === "EN"
        ? "3D measurement enabled · select A/B; use X/Y/Z to lock direction."
        : "Đo 3D đã bật · chọn A/B; dùng X/Y/Z để khóa hướng.",
    );
  }, [changeView, isMeasuring, lang, notify]);

  const applyCode = useCallback(
    async (nextCode: string, nextFileName?: string) => {
      const violation = programLimitViolation(nextCode);
      if (violation) {
        notify(
          violation === "lines"
            ? lang === "EN"
              ? `Program exceeds ${MAX_PROGRAM_LINES.toLocaleString()} lines. Split it before analysis.`
              : `Chương trình vượt ${MAX_PROGRAM_LINES.toLocaleString()} dòng. Hãy chia nhỏ trước khi phân tích.`
            : t.fileTooLarge,
        );
        return null;
      }

      const requestId = ++applyCodeRequestRef.current;
      prepareAbortRef.current?.abort();
      const abortController = new AbortController();
      prepareAbortRef.current = abortController;
      setIsPreparingProgram(true);
      try {
        const prepared = await prepareProgramOffThread({
          source: nextCode,
          stock,
          profile,
          workOffsets,
        }, abortController.signal);
        if (requestId !== applyCodeRequestRef.current) return null;
        const preparedFor = {
          source: nextCode,
          stock: prepared.stock,
          profile,
          workOffsets,
        };
        acceptPreparedSimulation(prepared, preparedFor);
        setStock(prepared.stock);
        setCode(nextCode);
        setDraftCode(nextCode);
        if (nextFileName) {
          setFileName(nextFileName);
          setProjectName(nextFileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
        }
        resetPlayback();
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setOrbit({ ...DEFAULT_ORBIT });
        return prepared.rotated;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return null;
        }
        if (requestId === applyCodeRequestRef.current) {
          notify(
            lang === "EN"
              ? "Could not analyze this program. The current workspace was kept."
              : "Không thể phân tích chương trình này. Không gian làm việc hiện tại được giữ nguyên.",
          );
        }
        return null;
      } finally {
        if (requestId === applyCodeRequestRef.current) {
          prepareAbortRef.current = null;
          setIsPreparingProgram(false);
        }
      }
    },
    [
      acceptPreparedSimulation,
      lang,
      notify,
      profile,
      resetPlayback,
      stock,
      t.fileTooLarge,
      workOffsets,
    ],
  );

  const readFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_PROGRAM_BYTES) {
        notify(t.fileTooLarge);
        return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["nc", "txt", "tap", "gcode", "cnc"].includes(extension)) {
        notify(t.unsupportedFormat);
        return;
      }
      setIsImporting(true);
      try {
        const text = await file.text();
        if (!text.trim()) {
          notify(t.emptyFileMsg);
          return;
        }
        const violation = programLimitViolation(text);
        if (violation) {
          notify(
            violation === "lines"
              ? lang === "EN"
                ? `Program exceeds ${MAX_PROGRAM_LINES.toLocaleString()} lines. Split it before importing.`
                : `Chương trình vượt ${MAX_PROGRAM_LINES.toLocaleString()} dòng. Hãy chia nhỏ trước khi nhập.`
              : t.fileTooLarge,
          );
          return;
        }
        const rotated = await applyCode(text, file.name);
        if (rotated === null) return;
        setMobilePanel("simulation");
        notify(
          rotated
            ? `Đã đọc ${file.name} và tự xoay phôi sang ${stock.height.toFixed(0)} × ${stock.width.toFixed(0)} mm.`
            : `Đã đọc ${file.name} hoàn toàn trên trình duyệt.`,
        );
      } catch {
        notify(t.fileReadErrorMsg);
      } finally {
        setIsImporting(false);
      }
    },
    [
      applyCode,
      lang,
      notify,
      stock.height,
      stock.width,
      t.emptyFileMsg,
      t.fileReadErrorMsg,
      t.fileTooLarge,
      t.unsupportedFormat,
    ],
  );

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = "";
  };

  const seekToLine = useCallback(
    (lineIndex: number, revealSimulation = true) => {
      const target = simulation.segments.findIndex(
        (segment) => segment.lineIndex >= lineIndex,
      );
      if (target >= 0) {
        setPlaying(false);
        setCursor(target);
        setSegmentProgress(0);
      }
      setDrawer(null);
      if (revealSimulation) setMobilePanel("simulation");
    },
    [simulation.segments],
  );

  const stepForward = useCallback(() => {
    setPlaying(false);
    if (!simulation.segments.length) return;
    setSegmentProgress(0);
    setCursor((current) =>
      current >= simulation.segments.length - 1 ? 0 : current + 1,
    );
  }, [simulation.segments.length]);

  const togglePlayback = useCallback(async () => {
    if (!simulation.segments.length) {
      notify(t.noMotionPlaybackMsg);
      return;
    }
    if (playing) {
      setPlaying(false);
      return;
    }
    if (
      cursor >= simulation.segments.length - 1 &&
      segmentProgress >= 1
    ) {
      setCursor(0);
      setSegmentProgress(0);
    }
    if (machineSound || finishSound) {
      const audioReady = await ensureAudio();
      if (!audioReady) {
        setMachineSound(false);
        setFinishSound(false);
        notify(t.audioUnavailableMsg);
      }
    }
    setPlaying(true);
  }, [
    cursor,
    ensureAudio,
    finishSound,
    machineSound,
    notify,
    playing,
    segmentProgress,
    simulation.segments.length,
    t.audioUnavailableMsg,
    t.noMotionPlaybackMsg,
  ]);

  useEffect(() => {
    if (!playing || !simulation.segments.length) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    const targetInterval =
      renderPerformanceProfile(quality).playbackFrameIntervalMs;

    const tick = (now: number) => {
      const delta = Math.min(80, now - previousTime);
      if (delta < targetInterval) {
        animationFrame = window.requestAnimationFrame(tick);
        return;
      }
      previousTime = now;
      const segment =
        simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
      if (!segment) {
        setPlaying(false);
        cncAudio.stopAll();
        return;
      }
      
      if (machineSound) {
        cncAudio.setSpindle(true, 18000); 
        cncAudio.setMove(true, segment.kind === "rapid", segment.feed || 1000);
      } else {
        cncAudio.stopAll();
      }

      const nominalFeed =
        segment.kind === "rapid"
          ? stock.rapidFeed
          : Math.max(1, segment.feed || 1000);
      const realDurationMs = (segment.length / (nominalFeed / 60)) * 1000;
      const displayDuration = Math.max(16 / speed, realDurationMs / speed);
      const increment = displayDuration > 0 ? delta / displayDuration : 1;

      setSegmentProgress((current) => {
        const next = current + increment;
        if (next >= 1) {
          const stepsToAdvance = Math.floor(next);
          const remainder = next - stepsToAdvance;
          if (cursor + stepsToAdvance >= simulation.segments.length) {
            setCursor(simulation.segments.length - 1);
            setPlaying(false);
            if (finishSound) cncAudio.playComplete();
            return 1;
          }
          setCursor((index) =>
            Math.min(index + stepsToAdvance, simulation.segments.length - 1),
          );
          return remainder;
        }
        return next;
      });
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      cncAudio.stopAll();
    };
  }, [
    playing,
    cursor,
    simulation.segments,
    speed,
    stock.rapidFeed,
    quality,
    machineSound,
    finishSound,
  ]);

  useEffect(() => {
    const container = codeScrollRef.current;
    if (!container) return;
    const lineTop = currentLine * CODE_ROW_HEIGHT;
    const lineBottom = lineTop + CODE_ROW_HEIGHT;
    if (lineTop < container.scrollTop) {
      container.scrollTop = lineTop;
    } else if (lineBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = lineBottom - container.clientHeight;
    }
    if (!container.contains(document.activeElement)) {
      setFocusedCodeLine(currentLine);
    }
  }, [currentLine]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (soundMenuOpen) {
          setSoundMenuOpen(false);
          return;
        }
        if (isGuideOpen) {
          setIsGuideOpen(false);
          return;
        }
        if (compareOpen) {
          setCompareOpen(false);
          return;
        }
        if (minicamOpen) {
          setMinicamOpen(false);
          return;
        }
        if (editorOpen) {
          setEditorOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (drawer) {
          setDrawer(null);
          return;
        }
        if (isMeasuring) {
          setIsMeasuring(false);
          return;
        }
        if (simulatorExpanded && !document.fullscreenElement) {
          setSimulatorExpanded(false);
        }
        return;
      }

      const hasBlockingSurface = Boolean(
        drawer ||
          settingsOpen ||
          editorOpen ||
          compareOpen ||
          minicamOpen ||
          isGuideOpen ||
          soundMenuOpen,
      );
      const usesAppBrowserShortcut =
        ((event.ctrlKey || event.metaKey) &&
          (event.code === "KeyO" || event.code === "Comma")) ||
        event.code === "F1" ||
        event.code === "F5" ||
        event.code === "F8" ||
        event.code === "F10";
      if (usesAppBrowserShortcut) event.preventDefault();
      if (hasBlockingSurface) return;

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyO") {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.code === "Comma") {
        event.preventDefault();
        openSettings();
        return;
      }
      if (event.code === "F1") {
        event.preventDefault();
        setIsGuideOpen(true);
        return;
      }
      if (event.code === "F5") {
        event.preventDefault();
        void togglePlayback();
        return;
      }
      if (event.code === "F10") {
        event.preventDefault();
        stepForward();
        return;
      }
      if (event.code === "F8") {
        event.preventDefault();
        resetPlayback();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [contenteditable='true']")) {
        return;
      }

      if (event.code === "KeyM") {
        event.preventDefault();
        toggleMeasurement();
      } else if (event.code === "KeyG") {
        event.preventDefault();
        setCodeCollapsed(false);
        setMobilePanel("code");
      } else if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      } else if (event.code === "Digit1") {
        changeView("xoy");
      } else if (event.code === "Digit2") {
        changeView("solid");
      } else if (event.code === "Digit3") {
        if (machineViewEnabled) {
          changeView("machine");
        } else {
          notify(t.machine3DShortcutMsg);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    compareOpen,
    changeView,
    drawer,
    editorOpen,
    isGuideOpen,
    isMeasuring,
    machineViewEnabled,
    minicamOpen,
    notify,
    openSettings,
    resetPlayback,
    settingsOpen,
    simulatorExpanded,
    soundMenuOpen,
    stepForward,
    t.machine3DShortcutMsg,
    toggleMeasurement,
    togglePlayback,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setSimulatorExpanded(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleFullscreen = async () => {
    if (simulatorExpanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setSimulatorExpanded(false);
      return;
    }

    setSimulatorExpanded(true);
    try {
      await appRef.current?.requestFullscreen();
    } catch {
      notify("Đã mở chế độ tập trung. Nhấn Esc để quay lại.");
    }
  };

  return (
    <main
      className={`cnc-app${dragActive ? " is-dragging" : ""}${simulatorExpanded ? " is-simulator-expanded" : ""}`}
      ref={appRef}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void readFile(file);
      }}
    >
      <div className="top-navigation-island">
        <header className="app-header">
          <div className="header-left">
        <div className="brand" aria-label="Lax's CNC Pro Workstation">
          <div className="brand-badge" title="Lax's CNC Workstation PRO">
            <div className="brand-logo-icon">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="cnc-logo-svg">
                <defs>
                  <linearGradient id="lax-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00f2fe" />
                    <stop offset="100%" stopColor="#4facfe" />
                  </linearGradient>
                  <linearGradient id="lax-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#26d9e8" />
                    <stop offset="100%" stopColor="#70eccb" />
                  </linearGradient>
                  <filter id="glow-drop" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00f2fe" floodOpacity="0.5" />
                  </filter>
                </defs>
                <path
                  d="M 26 12 A 11 11 0 1 1 20 6"
                  stroke="url(#lax-grad)"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#glow-drop)"
                />
                <circle cx="20" cy="6" r="3" fill="#70eccb" filter="drop-shadow(0 0 4px #70eccb)" />
                <circle cx="20" cy="6" r="1.2" fill="#ffffff" />
                <path
                  d="M 16 9 L 18 14 L 23 16 L 18 18 L 16 23 L 14 18 L 9 16 L 14 14 Z"
                  fill="url(#lax-glow)"
                  filter="drop-shadow(0 0 3px rgba(112, 236, 203, 0.4))"
                />
                <circle cx="16" cy="16" r="2" fill="#ffffff" />
              </svg>
            </div>
          </div>
          <div className="brand-copy">
            <span className="brand-title">
              <span className="brand-accent">{"Lax's"}</span> CNC
            </span>
          </div>
        </div>
        
        <label className="project-field">
          <span>{t.projectLabel}</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label={t.projectLabel}
          />
          <Icon name="edit" size={15} />
        </label>
          </div>
          <div className="header-center">
        <div className="program-chip" title={fileName}>
          <span>{t.programLabel}</span>
          <strong>{fileName}</strong>
          <small>{simulation.lines.length} {t.statusLine.toUpperCase()}</small>
        </div>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".nc,.txt,.tap,.gcode,.cnc"
          onChange={handleFileInput}
        />
        <button
          className="import-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title={t.uploadFile}
          disabled={isImporting}
          aria-busy={isImporting}
        >
          <Icon name="upload" size={18} />
          <span>{isImporting ? t.loadingGcode : t.importBtn}</span>
        </button>
        <button
          className="guide-button"
          type="button"
          onClick={() => setIsGuideOpen(true)}
          title={t.guideBtn}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span>{t.guideBtn}</span>
        </button>
        <button
          className="guide-button"
          type="button"
          onClick={() => setSetupSheetOpen(true)}
          title={t.setupSheetTitle}
        >
          <Icon name="file-text" size={16} />
          <span>{t.setupSheetBtn}</span>
        </button>
        <button
          className="guide-button"
          type="button"
          onClick={() => setCncControllerOpen(true)}
          title={t.controllerTitle}
          style={{ border: "1px solid rgba(56, 189, 248, 0.4)", background: "rgba(2, 132, 199, 0.15)" }}
        >
          <Icon name="usb" size={16} />
          <span>{t.controllerBtn}</span>
        </button>
        <button
          className="lang-toggle"
          type="button"
          onClick={() => toggleLanguage(lang === "VN" ? "EN" : "VN")}
          title={lang === "VN" ? "Switch to English" : "Chuyển sang Tiếng Việt"}
        >
          <span className={`lang-opt ${lang === "EN" ? "is-active" : ""}`}>EN</span>
          <span className="lang-divider">|</span>
          <span className={`lang-opt ${lang === "VN" ? "is-active" : ""}`}>VN</span>
        </button>
          </div>
          <div className="header-right">
        <label className="profile-select">
          <span className="visually-hidden">{t.profileLabel}</span>
          <select
            value={profile}
            onChange={(event) => {
              setProfile(event.target.value as MachineProfile);
              resetPlayback();
            }}
          >
            <option value="router-custom">{t.routerCustom}</option>
            <option value="iso">{t.isoBasic}</option>
          </select>
        </label>
        <div className="connection-state">
          <span className="status-dot" />
          <span>
            <b>CNC-01</b>
            <small>{t.localProcessing}</small>
          </span>
        </div>
          </div>
      </header>

      <section
        className="command-bar"
        aria-label={lang === "EN" ? "Simulation controls" : "Điều khiển mô phỏng"}
      >
        <div className="playback-controls">
          <button
            className="primary-control"
            type="button"
            onClick={togglePlayback}
            disabled={!simulation.segments.length}
            aria-label={playing ? t.pause : t.play}
            title={`${playing ? t.pause : t.play} · Space / F5`}
          >
            <Icon name={playing ? "pause" : "play"} size={22} />
          </button>
          <button
            className="secondary-control"
            type="button"
            onClick={stepForward}
            disabled={!simulation.segments.length}
            aria-label={t.stepForward}
            title={`${t.stepForward} · F10`}
          >
            <Icon name="step" size={20} />
          </button>
          <div style={{ position: "relative" }}>
            <button
              ref={soundButtonRef}
              className={`secondary-control ${(machineSound || finishSound) ? "is-active" : ""}`}
              type="button"
              onClick={async () => {
                if (!soundMenuOpen) positionSoundMenu();
                setSoundMenuOpen((open) => !open);
                if (!(await ensureAudio())) {
                  setMachineSound(false);
                  setFinishSound(false);
                  notify(t.audioUnavailableMsg);
                }
              }}
              aria-label={lang === "EN" ? "Sound settings" : "Thiết lập âm thanh"}
              aria-expanded={soundMenuOpen}
              aria-controls="sound-settings-popover"
            >
              <Icon name={(machineSound || finishSound) ? "volume" : "volume-x"} size={20} />
            </button>
          </div>
          <button
            className="secondary-control"
            type="button"
            onClick={resetPlayback}
            aria-label={t.reset}
            title={`${t.reset} · F8`}
          >
            <Icon name="reset" size={20} />
          </button>
        </div>
        <div className={`playback-readout${playing ? " is-running" : ""}`}>
          <span>
            <small>BLOCK</small>
            <strong>{activeSegment?.lineNumber ?? 0}</strong>
          </span>
          <i />
          <b>{playing ? "RUNNING" : "READY"}</b>
        </div>
        
        <div className="view-switch" aria-label="Góc nhìn mô phỏng">
          {availableViewModes.map((viewMode, index) => (
            <button
              type="button"
              className={view === viewMode ? "is-active" : ""}
              aria-pressed={view === viewMode}
              title={`${getViewMeta(viewMode, t).title} · phím ${index + 1}`}
              onClick={() => changeView(viewMode)}
              key={viewMode}
            >
              {viewMode === "iso" || viewMode === "solid" || viewMode === "machine" ? (
                <Icon name="cube" size={16} />
              ) : (
                <Icon name="panel" size={16} />
              )}
              <span>{getViewMeta(viewMode, t).short}</span>
              {viewMode === "machine" && (
                <em className="view-switch__beta">{t.experimentalBadge}</em>
              )}
              <kbd>{index + 1}</kbd>
            </button>
          ))}
        </div>
        <label className="speed-control">
          <span>{t.speedControl}</span>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={5}>5×</option>
            <option value={10}>10×</option>
            <option value={20}>20×</option>
          </select>
        </label>
        <label className="speed-control quality-control">
          <span>{t.configLabel}</span>
          <select
            value={quality}
            onChange={(event) =>
              setQuality(event.target.value as SimulationQuality)
            }
            title={
              quality === "high"
                ? lang === "EN"
                  ? "Maximum local graphics: optimized 2K stock map in motion, crisp 4K when stopped"
                  : "Đồ họa tối đa: phôi 2K tối ưu khi chạy, tự dựng lại 4K sắc nét khi dừng"
                : lang === "EN"
                  ? "Balanced simulation quality using this device's GPU"
                  : "Chất lượng mô phỏng cân bằng theo GPU của thiết bị này"
            }
          >
            <option value="low">{t.perfLow}</option>
            <option value="medium">{t.perfMedium}</option>
            <option value="high">{t.perfHigh}</option>
          </select>
        </label>
        
        <div className="canvas-tools">
          <ToolbarButton
            icon="ruler"
            label={
              isMeasuring
                ? lang === "EN"
                  ? "Close smart measurement"
                  : "Đóng công cụ đo thông minh"
                : lang === "EN"
                  ? "Smart 3D measurement · switches to Solid automatically"
                  : "Đo thông minh 3D · tự chuyển sang Solid"
            }
            onClick={toggleMeasurement}
            active={isMeasuring}
          />
          <ToolbarButton
            icon="crosshair"
            label={t.fitToScreen}
            onClick={onResetView}
          />
          <ToolbarButton
            icon={simulatorExpanded ? "collapse" : "fullscreen"}
            label={
              simulatorExpanded
                ? "Thoát toàn màn hình"
                : "Toàn màn hình mô phỏng"
            }
            onClick={() => void handleFullscreen()}
            active={simulatorExpanded}
          />
          <ToolbarButton
            icon="panel"
            label={t.analysisDrawerTooltip}
            onClick={() => setDrawer(drawer ? null : "diagnostics")}
            active={!!drawer}
          />
          <ToolbarButton
            icon="settings"
            label={t.machineSetupTooltip}
            onClick={openSettings}
          />
        </div>
      </section>
      </div>


      <section
        className={`workspace${codeCollapsed ? " is-code-collapsed" : ""} is-mobile-${mobilePanel}`}
        aria-label={lang === "EN" ? "CNC workspace" : "Không gian làm việc CNC"}
      >
        <aside
          className="code-panel"
          aria-label={lang === "EN" ? "G-code program" : "Chương trình G-code"}
        >
          <div className="panel-titlebar">
            <div className="panel-title-copy">
              <strong>PROGRAM</strong>
              <span>{fileName}</span>
            </div>
            <div className="panel-title-actions">
              <span className="program-count">
                {simulation.lines.length} LINES · {simulation.segments.length} MOVES
              </span>
              <button
                type="button"
                onClick={() => {
                  setCodeCollapsed(true);
                  setMobilePanel("simulation");
                }}
                aria-label="Thu gọn bảng G-code"
                title="Thu gọn bảng G-code"
              >
                <Icon name="panel" size={17} />
              </button>
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                aria-label="So sánh File (File Compare)"
                title="So sánh File (File Compare)"
              >
                <Icon name="compare" size={17} fallback="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </button>
              <button
                type="button"
                onClick={() => setMinicamOpen(true)}
                aria-label="Mini CAM (CNC-Calc)"
                title="Mini CAM (CNC-Calc)"
              >
                <Icon name="layer" size={17} fallback="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftCode(code);
                  setEditorOpen(true);
                }}
                aria-label="Sửa G-code"
                title="Sửa hoặc dán G-code"
              >
                <Icon name="edit" size={17} />
              </button>
            </div>
          </div>
          <div
            className="code-lines"
            ref={codeScrollRef}
            role="listbox"
            aria-label={lang === "EN" ? "G-code program lines" : "Các dòng chương trình G-code"}
          >
            <div
              className="code-lines-virtual-space"
              style={{ height: simulation.lines.length * CODE_ROW_HEIGHT }}
            >
            {simulation.lines
              .slice(visibleCodeRange.start, visibleCodeRange.end)
              .map((line, visibleIndex) => {
              const index = visibleCodeRange.start + visibleIndex;
              return (
              <button
                type="button"
                role="option"
                aria-selected={index === currentLine}
                aria-current={index === currentLine ? "true" : undefined}
                tabIndex={index === focusedCodeLine ? 0 : -1}
                className={`code-line${index === currentLine ? " is-active" : ""}`}
                data-code-line={index}
                aria-posinset={index + 1}
                aria-setsize={simulation.lines.length}
                title={line || undefined}
                key={`${index}-${line}`}
                style={{ transform: `translateY(${index * CODE_ROW_HEIGHT}px)` }}
                onFocus={() => setFocusedCodeLine(index)}
                onClick={() => seekToLine(index)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "ArrowUp" &&
                    event.key !== "ArrowDown" &&
                    event.key !== "Home" &&
                    event.key !== "End"
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? simulation.lines.length - 1
                        : Math.max(
                            0,
                            Math.min(
                              simulation.lines.length - 1,
                              index + (event.key === "ArrowDown" ? 1 : -1),
                            ),
                          );
                  setFocusedCodeLine(nextIndex);
                  seekToLine(nextIndex, false);
                  window.requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLElement>(`[data-code-line="${nextIndex}"]`)
                      ?.focus(),
                  );
                }}
              >
                <span className="line-marker">
                  {index === currentLine ? "▶" : ""}
                </span>
                <span className="line-number">
                  {String(index + 1).padStart(4, "0")}
                </span>
                <code>{line ? syntaxLine(line) : " "}</code>
              </button>
              );
            })}
            </div>
          </div>
          <div className="code-statusbar">
            <span>
              Dòng {currentLine + 1} / {simulation.lines.length}
            </span>
            <span className="code-mode-badges">
              <b>{activeModeLabel}</b>
              <b>{activeDistanceCodeLabel}</b>
              <b>{activeUnits === "mm" ? "G21 MM" : "G20 INCH"}</b>
              <b>{PLANE_GCODE[activePlane]} {activePlane}</b>
            </span>
          </div>
        </aside>

        <section
          className="simulation-panel"
          aria-label={lang === "EN" ? "Toolpath simulation" : "Mô phỏng đường chạy dao"}
          aria-busy={analysisBusy}
        >
          <div className="simulation-titlebar">
            <div className="simulation-heading">
              {codeCollapsed ? (
                <button
                  type="button"
                  onClick={() => {
                    setCodeCollapsed(false);
                    setMobilePanel("code");
                  }}
                  className="show-code-button"
                  aria-label="Hiện bảng G-code"
                  title="Hiện bảng G-code"
                >
                  <Icon name="panel" size={15} />
                  <span>G-CODE</span>
                </button>
              ) : null}
              <span>{getViewMeta(view, t).title.toUpperCase()}</span>
              <strong
                className={`simulation-state${playing ? " is-running" : ""}${analysisBusy ? " is-processing" : ""}`}
                aria-live="polite"
              >
                <i />
                {analysisBusy ? (lang === "EN" ? "ANALYZING" : "ĐANG PHÂN TÍCH") : playing ? "LIVE" : "READY"}
              </strong>
              <small>
                BLOCK {activeSegment?.lineNumber ?? 0} · {simulation.segments.length}{" "}
                {lang === "EN" ? "moves" : "chuyển động"} · {simulation.parts.length} {lang === "EN" ? "parts" : "chi tiết"}
              </small>
              {analysisBusy ? (
                <button
                  type="button"
                  className="cancel-analysis-button"
                  onClick={cancelProgramAnalysis}
                >
                  {lang === "EN" ? "Cancel" : "Hủy"}
                </button>
              ) : null}
              {simulationProcessingError ? (
                <small className="analysis-error" title={simulationProcessingError}>
                  {lang === "EN" ? "Analysis failed; previous result kept" : "Phân tích lỗi; đang giữ kết quả trước"}
                </small>
              ) : null}
            </div>
            <div className="path-legend">
              <span>
                <i className="legend-line cut" /> {t.cuts}
              </span>
              <button
                type="button"
                className={`rapid-toggle${showRapids ? " is-active" : ""}`}
                aria-pressed={showRapids}
                onClick={() => setShowRapids((value) => !value)}
                title={lang === "EN" ? "Toggle rapid G0 moves" : "Ẩn hoặc hiện đường chạy nhanh G0"}
              >
                <i className="legend-line rapid" /> {t.rapids}
                <small>{showRapids ? (lang === "EN" ? "ON" : "HIỆN") : (lang === "EN" ? "OFF" : "ẨN")}</small>
              </button>
              <span>
                <i className="legend-dot" /> {t.toolPos}
              </span>
            </div>
          </div>
          <ToolpathCanvas
            lang={lang}
            simulation={simulation}
            stock={stock}
            cursor={cursor}
            segmentProgress={segmentProgress}
            playing={playing}
            view={view}
            zoom={zoom}
            pan={pan}
            orbit={orbit}
            showRapids={showRapids}
            quality={quality}
            t={t}
            onZoom={setZoom}
            onPan={setPan}
            onOrbit={setOrbit}
            onResetView={onResetView}
            resetTrigger={resetTrigger}
            isMeasuring={isMeasuring}
            measurementSession={measurementSession}
            onMeasurementClose={() => setIsMeasuring(false)}
          />
          <div className="scrubber">
            <span className="scrubber-clock">
              <small>{t.statusRunTime.toUpperCase()}</small>
              <strong>
                {formatTime(
                  simulation.estimatedSeconds * (totalProgress / 100),
                )}
              </strong>
            </span>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(totalProgress * 10)}
              aria-label="Tiến độ mô phỏng"
              onChange={(event) => {
                const ratio = Number(event.target.value) / 1000;
                const exact = ratio * simulation.segments.length;
                setPlaying(false);
                setCursor(
                  Math.min(
                    simulation.segments.length - 1,
                    Math.max(0, Math.floor(exact)),
                  ),
                );
                setSegmentProgress(exact - Math.floor(exact));
              }}
            />
            <span className="scrubber-progress">
              <strong>{totalProgress.toFixed(0)}%</strong>
              <small>
                {Math.min(cursor + 1, simulation.segments.length)}/
                {simulation.segments.length} {t.statusLine.toUpperCase()}
              </small>
            </span>
            <span className="scrubber-clock">
              <small>{t.statusTotalTime.toUpperCase()}</small>
              <strong>{formatTime(simulation.estimatedSeconds)}</strong>
            </span>
          </div>
        </section>
      </section>

      <section
        className="metrics-strip"
        aria-label={lang === "EN" ? "Program metrics" : "Chỉ số chương trình"}
      >
        <MetricCard
          icon="sheet"
          label={t.stockMetric}
          detail={lang === "EN" ? `Thick ${stock.thickness.toFixed(1)} mm · Origin X${stock.originX} Y${stock.originY}` : `Dày ${stock.thickness.toFixed(1)} mm · Gốc X${stock.originX} Y${stock.originY}`}
          onClick={openSettings}
        >
          {stock.width.toFixed(0)} × {stock.height.toFixed(0)}
          <small> mm</small>
        </MetricCard>
        <MetricCard
          icon="tool"
          label={t.tool}
          detail={`F${activeSegment?.feed.toFixed(0) ?? 0} · S${activeSegment?.spindle.toFixed(0) ?? 0}`}
        >
          {activeSegment?.tool === "—" ? simulation.finalState.tool : activeSegment?.tool}
          <small> · Ø{stock.toolDiameter} mm</small>
        </MetricCard>
        <MetricCard
          icon="route"
          label={t.cutDistance}
          detail={lang === "EN" ? `Rapid ${formatLength(simulation.rapidLength)}` : `Chạy nhanh ${formatLength(simulation.rapidLength)}`}
        >
          {formatLength(simulation.cutLength)}
        </MetricCard>
        <MetricCard
          icon="clock"
          label={t.estTime}
          detail={`${lang === "EN" ? "Rem." : "Còn"} ${formatTime(simulation.estimatedSeconds * (1 - totalProgress / 100))}`}
        >
          {formatTime(simulation.estimatedSeconds)}
        </MetricCard>
        <MetricCard
          icon={errorCount ? "warning" : "check"}
          label={t.errorsMetric}
          tone={errorCount ? "danger" : "success"}
          detail={errorCount ? t.errorsAction : t.errorsNone}
          onClick={() => setDrawer("diagnostics")}
        >
          {errorCount}
        </MetricCard>
        <MetricCard
          icon="warning"
          label={t.warningsMetric}
          tone={warningCount ? "warning" : "success"}
          detail={warningCount ? t.warningsAction : t.warningsNone}
          onClick={() => setDrawer("diagnostics")}
        >
          {warningCount}
        </MetricCard>
        <div className="position-metric">
          <span>{t.currentPos} · {activeCoordinateLabel}</span>
          <div className="position-grid">
            <span>
              <b>X</b>
              {currentPosition.x.toFixed(3)}
            </span>
            <span>
              <b>Y</b>
              {currentPosition.y.toFixed(3)}
            </span>
            <span>
              <b>Z</b>
              {currentPosition.z.toFixed(3)}
            </span>
          </div>
        </div>
        <div className="progress-metric">
          <span>{t.progressLabel}</span>
          <div className="progress-row">
            <div
              className="progress-track"
              role="progressbar"
              aria-label={t.progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(totalProgress)}
            >
              <i style={{ width: `${totalProgress}%` }} />
            </div>
            <strong>{totalProgress.toFixed(0)}%</strong>
          </div>
          <small className="progress-detail">
            {t.blockLabel.toUpperCase()} {activeSegment?.lineNumber ?? 0} ·{" "}
            {Math.min(cursor + 1, simulation.segments.length)}/
            {simulation.segments.length}
          </small>
        </div>
      </section>

      <footer
        className="machine-statebar"
        aria-label={lang === "EN" ? "Machine state" : "Trạng thái máy"}
      >
        <span>
          <small>{t.modeLabel.toUpperCase()}</small>
          <b>
            {activeModeLabel} · {activeDistanceFooterLabel}
          </b>
        </span>
        <span>
          <small>{t.unitLabel.toUpperCase()}</small>
          <b>
            {activeUnits === "mm" ? "MM · G21" : "INCH · G20"}
          </b>
        </span>
        <span>
          <small>{t.planeLabel.toUpperCase()}</small>
          <b>{activePlane} · {PLANE_GCODE[activePlane]}</b>
        </span>
        <span>
          <small>{t.spindleLabel.toUpperCase()}</small>
          <b>{activeSegment?.spindle || simulation.finalState.spindle || 0} RPM</b>
        </span>
        <span>
          <small>{t.feedLabel.toUpperCase()}</small>
          <b>F {activeSegment?.feed.toFixed(0) ?? 0}</b>
        </span>
        <span>
          <small>{t.safeZLabel.toUpperCase()}</small>
          <b>{stock.safeZ.toFixed(3)}</b>
        </span>
        <span>
          <small>{t.drillLabel.toUpperCase()}</small>
          <b>{simulation.drillHoles} {lang === "EN" ? "HOLES" : "LỖ"}</b>
        </span>
        <span className="statebar-spacer" />
        <span className={`statebar-health${errorCount ? " has-error" : ""}`}>
          <i />
          <b>{errorCount ? t.checkRequired : t.programOk}</b>
        </span>
      </footer>

      <nav
        className="mobile-navigation"
        aria-label={lang === "EN" ? "Mobile workspace" : "Điều hướng không gian làm việc"}
      >
        <button
          type="button"
          className={mobilePanel === "simulation" ? "is-active" : ""}
          aria-current={mobilePanel === "simulation" ? "page" : undefined}
          onClick={() => setMobilePanel("simulation")}
        >
          <Icon name="cube" size={19} />
          <span>{t.mobileSimulation}</span>
        </button>
        <button
          type="button"
          className={mobilePanel === "code" ? "is-active" : ""}
          aria-current={mobilePanel === "code" ? "page" : undefined}
          onClick={() => {
            setCodeCollapsed(false);
            setMobilePanel("code");
          }}
        >
          <Icon name="panel" size={19} />
          <span>{t.mobileCode}</span>
        </button>
        <button
          type="button"
          className={drawer ? "is-active" : ""}
          aria-expanded={Boolean(drawer)}
          onClick={() => setDrawer(drawer ? null : "diagnostics")}
        >
          <Icon name="warning" size={19} />
          <span>{t.mobileAnalysis}</span>
        </button>
        <button type="button" onClick={openSettings}>
          <Icon name="settings" size={19} />
          <span>{t.mobileSettings}</span>
        </button>
      </nav>

      {drawer && (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label={lang === "EN" ? "Close analysis drawer" : "Đóng bảng phân tích"}
            onClick={() => setDrawer(null)}
          />
          <aside
            ref={drawerRef}
            className="analysis-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-drawer-title"
            tabIndex={-1}
          >
            <div className="drawer-header">
              <div>
                <small>{t.analysisTitle}</small>
                <h2 id="analysis-drawer-title">
                  {drawer === "diagnostics"
                    ? t.tabErrors
                    : drawer === "parts"
                      ? t.tabDimensions
                      : drawer === "offcuts"
                        ? t.tabRemnants
                        : drawer === "resume"
                          ? t.tabSmartResume
                          : t.tabPostProc}
                </h2>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label={lang === "EN" ? "Close" : "Đóng"}>
                <Icon name="close" />
              </button>
            </div>
            <div
              className="drawer-tabs"
              role="tablist"
              aria-label={t.analysisTitle}
              onKeyDown={(event) => {
                if (
                  event.key !== "ArrowLeft" &&
                  event.key !== "ArrowRight" &&
                  event.key !== "Home" &&
                  event.key !== "End"
                ) {
                  return;
                }
                event.preventDefault();
                const tabs = [
                  "diagnostics",
                  "parts",
                  "offcuts",
                  "resume",
                  "export",
                ] as const;
                const currentIndex = tabs.indexOf(drawer);
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : event.key === "ArrowRight"
                        ? (currentIndex + 1) % tabs.length
                        : (currentIndex - 1 + tabs.length) % tabs.length;
                const nextTab = tabs[nextIndex];
                setDrawer(nextTab);
                window.requestAnimationFrame(() =>
                  document.getElementById(`drawer-tab-${nextTab}`)?.focus(),
                );
              }}
            >
              <button
                type="button"
                id="drawer-tab-diagnostics"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "diagnostics"}
                tabIndex={drawer === "diagnostics" ? 0 : -1}
                className={drawer === "diagnostics" ? "is-active" : ""}
                onClick={() => setDrawer("diagnostics")}
              >
                {lang === "EN" ? "Errors" : "Kiểm lỗi"} <span>{simulation.diagnostics.length}</span>
              </button>
              <button
                type="button"
                id="drawer-tab-parts"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "parts"}
                tabIndex={drawer === "parts" ? 0 : -1}
                className={drawer === "parts" ? "is-active" : ""}
                onClick={() => setDrawer("parts")}
              >
                {lang === "EN" ? "Parts" : "Chi tiết"} <span>{simulation.parts.length}</span>
              </button>
              <button
                type="button"
                id="drawer-tab-offcuts"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "offcuts"}
                tabIndex={drawer === "offcuts" ? 0 : -1}
                className={drawer === "offcuts" ? "is-active" : ""}
                onClick={() => setDrawer("offcuts")}
              >
                {lang === "EN" ? "Remnants" : "Phôi dư"} <span>{simulation.offcuts?.length ?? 0}</span>
              </button>
              <button
                type="button"
                id="drawer-tab-resume"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "resume"}
                tabIndex={drawer === "resume" ? 0 : -1}
                className={drawer === "resume" ? "is-active" : ""}
                onClick={() => setDrawer("resume")}
              >
                {lang === "EN" ? "Resume" : "Phục hồi"}
              </button>
              <button
                type="button"
                id="drawer-tab-export"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "export"}
                tabIndex={drawer === "export" ? 0 : -1}
                className={drawer === "export" ? "is-active" : ""}
                onClick={() => setDrawer("export")}
              >
                {lang === "EN" ? "CAM Export" : "Xuất CAM"}
              </button>
            </div>
            <div
              className="drawer-content"
              id="analysis-drawer-panel"
              role="tabpanel"
              aria-labelledby={`drawer-tab-${drawer}`}
              tabIndex={0}
            >
              {drawer === "diagnostics" ? (
                simulation.diagnostics.length ? (
                  <div className="diagnostic-list">
                    {simulation.diagnostics.map((diagnostic) => (
                      <button
                        type="button"
                        className={`diagnostic-item is-${diagnostic.severity}`}
                        key={diagnostic.id}
                        onClick={() => seekToLine(diagnostic.lineIndex)}
                      >
                        <span className="diagnostic-icon">
                          <Icon
                            name={
                              diagnostic.severity === "info" ? "info" : "warning"
                            }
                            size={18}
                          />
                        </span>
                        <span className="diagnostic-text">
                          <div className="diagnostic-header">
                            <span className="line-badge">{lang === "EN" ? "Line" : "Dòng"} {diagnostic.lineIndex + 1}</span>
                            <span className="error-code">{diagnostic.code}</span>
                          </div>
                            <small>{translateDiagnostic(diagnostic.message, lang)}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Icon name="check" size={38} />
                    <h3>{t.noErrorsTitle}</h3>
                    <p>{t.noErrorsDesc}</p>
                  </div>
                )
              ) : drawer === "offcuts" ? (
                simulation.offcuts && simulation.offcuts.length ? (
                  <>
                    <div className="part-summary">
                      <div>
                        <small>{t.remnantTitle}</small>
                        <strong>{simulation.offcuts.length} {lang === "EN" ? "empty regions (MER)" : "vùng trống (MER)"}</strong>
                      </div>
                      <div>
                        <small>{t.mainStockSize}</small>
                        <strong>{stock.width} × {stock.height} mm</strong>
                      </div>
                    </div>
                    <div className="parts-table">
                      <div className="parts-table-head">
                        <span>{t.colCode}</span>
                        <span>{t.colSize}</span>
                        <span>{lang === "EN" ? "Coord (X, Y)" : "Tọa độ (X, Y)"}</span>
                        <span>{t.colAreaPct}</span>
                      </div>
                      {simulation.offcuts.map((off) => {
                        const pct = ((off.area / (stock.width * stock.height)) * 100).toFixed(1);
                        return (
                          <button
                            type="button"
                            key={off.id}
                            onClick={() => {
                              setPan({ x: -off.minX, y: -off.minY });
                              setZoom(1.5);
                            }}
                          >
                            <b>{off.id}</b>
                            <span>{off.width.toFixed(1)} × {off.height.toFixed(1)} mm</span>
                            <span>({off.minX.toFixed(1)}, {off.minY.toFixed(1)})</span>
                            <span><b>{pct}%</b> {lang === "EN" ? "stock" : "phôi"}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="method-note">
                      {t.merExplanation}
                    </p>
                  </>
                ) : (
                  <div className="empty-state">
                    <Icon name="cube" size={38} />
                    <h3>{t.noRemnantsTitle}</h3>
                    <p>{t.noRemnantsDesc}</p>
                  </div>
                )
              ) : drawer === "resume" ? (
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", color: "#e0e0e0" }}>
                  <div className="part-summary" style={{ background: "#181818", padding: "12px", borderRadius: "6px" }}>
                    <div>
                      <small>{lang === "EN" ? "Smart Resume Recovery Function" : "Chức năng phục hồi cắt dở (Smart Resume)"}</small>
                      <strong style={{ display: "block", marginTop: "4px" }}>{t.smartResumeDesc}</strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                      <small style={{ color: "#aaa" }}>{lang === "EN" ? "Resume from Block #:" : "Tiếp tục từ Block số:"}</small>
                      <input
                        type="number"
                        min={1}
                        max={simulation.segments.length}
                        value={resumeSegment}
                        onChange={(e) => setResumeSegment(Math.max(1, Math.min(simulation.segments.length, Number(e.target.value))))}
                        autoFocus
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#1e1e1e", color: "#fff" }}
                      />
                    </label>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                      <small style={{ color: "#aaa" }}>{t.safeZLabel}:</small>
                      <input
                        type="number"
                        value={resumeSafeZ}
                        onChange={(e) => setResumeSafeZ(Number(e.target.value))}
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#1e1e1e", color: "#fff" }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <small style={{ color: "#aaa" }}>{lang === "EN" ? `Safe recovery G-code (Insert before Block #${resumeSegment}):` : `G-code khôi phục an toàn (Chèn vào trước Block ${resumeSegment}):`}</small>
                    <textarea
                      readOnly
                      rows={8}
                      value={generateSmartResume(simulation, resumeSegment, resumeSafeZ, lang)}
                      style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #444", background: "#0d0d0d", color: "#00ff66", fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
                    />
                  </div>
                  <button
                    type="button"
                    className="accent-button"
                    style={{ alignSelf: "flex-start", padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                    onClick={() =>
                      void copyText(
                        generateSmartResume(
                          simulation,
                          resumeSegment,
                          resumeSafeZ,
                          lang,
                        ),
                        t.copiedRecoveryAlert,
                      )
                    }
                  >
                    <Icon name="copy" size={16} /> {lang === "EN" ? "Copy Recovery G-code" : "Sao chép G-code phục hồi"}
                  </button>
                </div>
              ) : drawer === "export" ? (
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", color: "#e0e0e0" }}>
                  <div className="part-summary" style={{ background: "#181818", padding: "12px", borderRadius: "6px" }}>
                    <div>
                      <small>{t.postProcTitle}</small>
                      <strong style={{ display: "block", marginTop: "4px" }}>{t.postProcDesc}</strong>
                    </div>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <small style={{ color: "#aaa" }}>{t.controllerDialect}:</small>
                    <select
                      value={exportType}
                      onChange={(e) => setExportType(e.target.value as PostProcessorType)}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#1e1e1e", color: "#fff" }}
                    >
                      <option value="ncstudio">{t.ncstudioLabel}</option>
                      <option value="syntec">{t.syntecLabel}</option>
                    </select>
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <small style={{ color: "#aaa" }}>{t.camPostResult}:</small>
                    <textarea
                      readOnly
                      rows={10}
                      value={exportCAM(simulation, exportType, projectName, lang)}
                      style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #444", background: "#0d0d0d", color: "#00eaff", fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className="accent-button"
                      style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                      onClick={() => {
                        const content = exportCAM(simulation, exportType, projectName, lang);
                        const blob = new Blob([content], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${projectName.toLowerCase().replace(/\s+/g, "-")}-${exportType}.nc`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Icon name="upload" size={16} /> {lang === "EN" ? "Download .NC File" : "Tải xuống file .NC"} ({exportType.toUpperCase()})
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                      onClick={() =>
                        void copyText(
                          exportCAM(simulation, exportType, projectName, lang),
                          t.copiedAlert,
                        )
                      }
                    >
                      <Icon name="copy" size={16} /> {t.copyBtn}
                    </button>
                  </div>
                </div>
              ) : simulation.parts.length ? (
                <>
                  <div className="part-summary">
                    <div>
                      <small>{t.detected}</small>
                      <strong>{simulation.parts.length} {lang === "EN" ? "parts" : "chi tiết"}</strong>
                    </div>
                    <div>
                      <small>{t.requiredClearance}</small>
                      <strong>{stock.clearance.toFixed(1)} mm</strong>
                    </div>
                  </div>
                  <div className="parts-table">
                    <div className="parts-table-head">
                      <span>{t.colCode}</span>
                      <span>{t.colDim}</span>
                      <span>{t.colNearest}</span>
                      <span>{t.colEdge}</span>
                    </div>
                    {simulation.parts.map((part) => (
                      <button
                        type="button"
                        className={
                          (part.nearestGap ?? Number.POSITIVE_INFINITY) <
                            stock.clearance || part.edgeGap < stock.clearance
                            ? "has-warning"
                            : ""
                        }
                        key={part.id}
                        onClick={() => seekToLine(part.sourceLine)}
                      >
                        <b>{part.id}</b>
                        <span>
                          {part.width.toFixed(1)} × {part.height.toFixed(1)}
                        </span>
                        <span
                          className={
                            (part.nearestGap ?? Number.POSITIVE_INFINITY) <
                            stock.clearance
                              ? "is-warning"
                              : ""
                          }
                        >
                          {part.nearestGap === null
                            ? "—"
                            : `${part.nearestGap.toFixed(1)} mm`}
                        </span>
                        <span
                          className={
                            part.edgeGap < stock.clearance ? "is-warning" : ""
                          }
                        >
                          {part.edgeGap.toFixed(1)} mm
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="method-note">
                    {t.partMethodNote}
                  </p>
                </>
              ) : (
                <div className="empty-state">
                  <Icon name="ruler" size={38} />
                  <h3>{t.noPartsTitle}</h3>
                  <p>
                    {t.noPartsDesc}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {settingsOpen && (
        <ResponsiveDialog
          className="settings-modal"
          size="large"
          height="tall"
          titleId="settings-dialog-title"
          onClose={() => setSettingsOpen(false)}
        >
            <div className="modal-header">
              <div>
                <small>{t.machineProfile}</small>
                <h2 id="settings-dialog-title">{t.stockToolTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label={lang === "EN" ? "Close" : "Đóng"}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Live Config Summary HUD */}
              <div className="settings-hud-summary">
                <div className="settings-hud-card">
                  <span className="settings-hud-card-icon">
                    <Icon name="panel" size={16} />
                  </span>
                  <div>
                    <div className="settings-hud-card-label">{lang === "EN" ? "Stock Size" : "Kích thước phôi"}</div>
                    <div className="settings-hud-card-value">
                      {settingsDraft.stock.width} × {settingsDraft.stock.height} × {settingsDraft.stock.thickness} mm
                    </div>
                  </div>
                </div>
                <div className="settings-hud-card">
                  <span className="settings-hud-card-icon">
                    <Icon name="compass" size={16} />
                  </span>
                  <div>
                    <div className="settings-hud-card-label">{lang === "EN" ? "Z0 Datum" : "Mốc Z0"}</div>
                    <div className="settings-hud-card-value" style={{ color: "#38bdf8" }}>
                      {settingsDraft.stock.zZero === "bottom"
                        ? (lang === "EN" ? "Bottom = Z0" : "Đáy phôi / Mặt bàn")
                        : settingsDraft.stock.zZero === "top"
                          ? (lang === "EN" ? "Top = Z0" : "Mặt trên phôi")
                          : (lang === "EN" ? "Auto-detect" : "Tự nhận diện")}
                    </div>
                  </div>
                </div>
                <div className="settings-hud-card">
                  <span className="settings-hud-card-icon">
                    <Icon name="crosshair" size={16} />
                  </span>
                  <div>
                    <div className="settings-hud-card-label">{lang === "EN" ? "Origin" : "Gốc phôi"}</div>
                    <div className="settings-hud-card-value">
                      X={settingsDraft.stock.originX}, Y={settingsDraft.stock.originY}
                    </div>
                  </div>
                </div>
                <div className="settings-hud-card">
                  <span className="settings-hud-card-icon">
                    <Icon name="sparkles" size={16} />
                  </span>
                  <div>
                    <div className="settings-hud-card-label">{t.activeToolSummary}</div>
                    <div className="settings-hud-card-value">
                      Ø{settingsDraft.stock.toolDiameter} mm · {(settingsDraft.stock.tools || []).length} {t.toolsInLib}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modern Tab Bar */}
              <div className="settings-modal-v2-nav" aria-label={t.stockToolTitle}>
                <button
                  type="button"
                  className={`settings-v2-tab-btn ${settingsTab === "stock" ? "is-active" : ""}`}
                  onClick={() => setSettingsTab("stock")}
                >
                  <Icon name="panel" size={15} />
                  <span>{t.tabSettingsStock}</span>
                </button>
                <button
                  type="button"
                  className={`settings-v2-tab-btn ${settingsTab === "tools" ? "is-active" : ""}`}
                  onClick={() => setSettingsTab("tools")}
                >
                  <Icon name="sparkles" size={15} />
                  <span>{t.tabSettingsTools}</span>
                  <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "10px", background: "rgba(255,255,255,0.1)" }}>
                    {(settingsDraft.stock.tools || []).length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`settings-v2-tab-btn ${settingsTab === "safety" ? "is-active" : ""}`}
                  onClick={() => setSettingsTab("safety")}
                >
                  <Icon name="shield" size={15} />
                  <span>{t.tabSettingsSafety}</span>
                </button>
                <button
                  type="button"
                  className={`settings-v2-tab-btn ${settingsTab === "preferences" ? "is-active" : ""}`}
                  onClick={() => setSettingsTab("preferences")}
                >
                  <Icon name="settings" size={15} />
                  <span>{t.tabSettingsPrefs}</span>
                </button>
              </div>

              {/* TAB 1: STOCK & ORIGIN */}
              {settingsTab === "stock" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Quick Sheet Presets */}
                  <div className="quick-preset-bar">
                    <span className="quick-preset-label">{t.quickStockPresets}:</span>
                    <button
                      type="button"
                      className="quick-preset-btn"
                      onClick={() => {
                        updateDraftStock((cur) =>
                          resizeStockPreservingPinnedOrigin({ ...cur, thickness: 17 }, 2440, 1220),
                        );
                      }}
                    >
                      {t.presetSheetFull}
                    </button>
                    <button
                      type="button"
                      className="quick-preset-btn"
                      onClick={() => {
                        updateDraftStock((cur) =>
                          resizeStockPreservingPinnedOrigin({ ...cur, thickness: 18 }, 1220, 1220),
                        );
                      }}
                    >
                      {t.presetSheetHalf}
                    </button>
                    <button
                      type="button"
                      className="quick-preset-btn"
                      onClick={() => {
                        updateDraftStock((cur) =>
                          resizeStockPreservingPinnedOrigin({ ...cur, thickness: 10 }, 600, 400),
                        );
                      }}
                    >
                      {t.presetSheetAlu}
                    </button>
                    <button
                      type="button"
                      className="quick-preset-btn"
                      onClick={() => {
                        updateDraftStock((cur) =>
                          resizeStockPreservingPinnedOrigin({ ...cur, thickness: 3 }, 300, 200),
                        );
                      }}
                    >
                      {t.presetSheetMica}
                    </button>
                  </div>

                  {/* Stock Dimensions Inputs */}
                  <div className="settings-grid">
                    {([
                      ["width", t.lblWidth, "mm"],
                      ["height", t.lblHeight, "mm"],
                      ["thickness", t.lblThickness, "mm"],
                    ] as const).map(([key, label, unit]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            value={settingsDraft.stock[key]}
                            min={0.001}
                            max={100000}
                            aria-invalid={isInvalidStockField(key, settingsDraft.stock[key])}
                            onChange={(event) =>
                              updateDraftStock((current) => {
                                const value = Number(event.target.value) || 0;
                                if (key === "width") {
                                  return resizeStockPreservingPinnedOrigin(current, value, current.height);
                                }
                                if (key === "height") {
                                  return resizeStockPreservingPinnedOrigin(current, current.width, value);
                                }
                                return { ...current, [key]: value };
                              })
                            }
                          />
                          <small>{unit}</small>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Z0 Reference Datum Cards */}
                  <div>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "#f8fafc" }}>
                      {t.stockZReference}
                    </span>
                    <div className="z0-datum-card-grid">
                      <button
                        type="button"
                        className={`z0-datum-card ${(settingsDraft.stock.zZero ?? "auto") === "top" ? "is-active" : ""}`}
                        onClick={() => updateDraftStock((cur) => ({ ...cur, zZero: "top" }))}
                      >
                        <div className="z0-datum-header">
                          <span className="z0-datum-title">{t.stockZTop}</span>
                          <span className="z0-datum-badge">Z0 = TOP</span>
                        </div>
                        <span className="z0-datum-desc">
                          {lang === "EN" ? "Top surface is Z=0; cuts penetrate in negative Z. Standard for wood & metal milling." : "Mặt trên phôi là Z=0, ăn sâu vào phôi là Z âm. Tiêu chuẩn phay CNC thông dụng."}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`z0-datum-card ${(settingsDraft.stock.zZero ?? "auto") === "bottom" ? "is-active" : ""}`}
                        onClick={() => updateDraftStock((cur) => ({ ...cur, zZero: "bottom" }))}
                      >
                        <div className="z0-datum-header">
                          <span className="z0-datum-title">{t.stockZBottom}</span>
                          <span className="z0-datum-badge">Z0 = BED</span>
                        </div>
                        <span className="z0-datum-desc">
                          {lang === "EN" ? "Bottom table surface is Z=0; Z is positive up to stock thickness. Ideal for through-cutting." : "Mặt bàn máy là Z=0, Z dương từ đáy lên bề mặt. Tối ưu khi cắt đứt bảo vệ mặt bàn."}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`z0-datum-card ${(settingsDraft.stock.zZero ?? "auto") === "auto" ? "is-active" : ""}`}
                        onClick={() => updateDraftStock((cur) => ({ ...cur, zZero: "auto" }))}
                      >
                        <div className="z0-datum-header">
                          <span className="z0-datum-title">{t.stockZAuto}</span>
                          <span className="z0-datum-badge">AUTO</span>
                        </div>
                        <span className="z0-datum-desc">
                          {t.stockZReferenceHelp}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* 9-Point Origin Widget & Origin Inputs */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", alignItems: "center" }}>
                    <div className="quick-origin-widget" style={{ width: "100%" }}>
                      <span className="quick-origin-title">{t.quickOrigin}</span>
                      <div className="quick-origin-grid">
                        {[
                          { id: "tl", x: 0, y: -settingsDraft.stock.height, title: "Top-Left" },
                          { id: "tc", x: -settingsDraft.stock.width / 2, y: -settingsDraft.stock.height, title: "Top-Center" },
                          { id: "tr", x: -settingsDraft.stock.width, y: -settingsDraft.stock.height, title: "Top-Right" },
                          { id: "c", x: -settingsDraft.stock.width / 2, y: -settingsDraft.stock.height / 2, title: "Center" },
                          { id: "bl", x: 0, y: 0, title: "Bottom-Left" },
                          { id: "bc", x: -settingsDraft.stock.width / 2, y: 0, title: "Bottom-Center" },
                          { id: "br", x: -settingsDraft.stock.width, y: 0, title: "Bottom-Right" },
                        ].map((preset) => {
                          const isActive = settingsDraft.stock.originX === preset.x && settingsDraft.stock.originY === preset.y;
                          return (
                            <button
                              key={preset.id}
                              className={isActive ? "is-active" : ""}
                              type="button"
                              title={preset.title}
                              aria-pressed={isActive}
                              onClick={() =>
                                updateDraftStock((current) => ({
                                  ...current,
                                  originX: preset.x,
                                  originY: preset.y,
                                }))
                              }
                            >
                              <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: "visible" }}>
                                <rect x="15" y="15" width="70" height="70" fill="none" stroke="currentColor" strokeWidth="6" />
                                <circle cx="15" cy="15" r="10" fill={preset.id.includes('t') && preset.id.includes('l') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                                <circle cx="50" cy="15" r="10" fill={preset.id === 'tc' ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                                <circle cx="85" cy="15" r="10" fill={preset.id.includes('t') && preset.id.includes('r') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                                <circle cx="15" cy="85" r="10" fill={preset.id.includes('b') && preset.id.includes('l') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                                <circle cx="50" cy="85" r="10" fill={preset.id === 'bc' ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                                <circle cx="85" cy="85" r="10" fill={preset.id.includes('b') && preset.id.includes('r') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                                <circle cx="50" cy="50" r="10" fill={preset.id === 'c' ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="settings-grid" style={{ width: "100%", gridTemplateColumns: "1fr 1fr" }}>
                      <label>
                        <span>{t.lblOriginX}</span>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            value={settingsDraft.stock.originX}
                            onChange={(e) => updateDraftStock((cur) => ({ ...cur, originX: Number(e.target.value) || 0 }))}
                          />
                          <small>mm</small>
                        </div>
                      </label>
                      <label>
                        <span>{t.lblOriginY}</span>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            value={settingsDraft.stock.originY}
                            onChange={(e) => updateDraftStock((cur) => ({ ...cur, originY: Number(e.target.value) || 0 }))}
                          />
                          <small>mm</small>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TOOLS & LIBRARY */}
              {settingsTab === "tools" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Main Tool Quick Selector */}
                  <div style={{ padding: "12px", background: "rgba(15, 23, 30, 0.6)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#f8fafc" }}>
                        {t.lblToolDia} (Mặc định)
                      </span>
                      <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: "700", fontFamily: "var(--mono)" }}>
                        Ø{settingsDraft.stock.toolDiameter} mm
                      </span>
                    </div>
                    <div className="quick-preset-bar" style={{ background: "transparent", border: "none", padding: 0 }}>
                      <span className="quick-preset-label">{t.quickToolPills}:</span>
                      {[1.0, 2.0, 3.175, 4.0, 6.0, 8.0, 12.7].map((dia) => (
                        <button
                          key={dia}
                          type="button"
                          className={`quick-preset-btn ${settingsDraft.stock.toolDiameter === dia ? "is-active" : ""}`}
                          onClick={() => updateDraftStock((cur) => ({ ...cur, toolDiameter: dia }))}
                        >
                          Ø{dia} mm {dia === 3.175 ? '(1/8")' : dia === 12.7 ? '(1/2")' : ""}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tool Library */}
                  <div className="tool-library" style={{ marginTop: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <h3 style={{ margin: 0 }}>{t.toolLibrary}</h3>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                        {(settingsDraft.stock.tools || []).length} {t.toolsInLib}
                      </span>
                    </div>
                    <div className="tool-list">
                      {(settingsDraft.stock.tools || []).map((tool, index) => (
                        <div key={index} className="tool-item">
                          <label style={{ flex: 1 }}>
                            <span>{t.toolId}</span>
                            <div>
                              <input
                                type="text"
                                value={tool.id}
                                onChange={(e) => {
                                  const newTools = [...(settingsDraft.stock.tools || [])];
                                  newTools[index] = { ...tool, id: e.target.value };
                                  updateDraftStock((current) => ({ ...current, tools: newTools }));
                                }}
                              />
                            </div>
                          </label>
                          <label style={{ flex: 1.5 }}>
                            <span>{t.toolType}</span>
                            <div>
                              <select
                                value={tool.type}
                                onChange={(e) => {
                                  const newTools = [...(settingsDraft.stock.tools || [])];
                                  const type = e.target.value as "flat" | "ball" | "vbit";
                                  const nextTool = { ...tool, type };
                                  if (type === "vbit") {
                                    nextTool.angle = tool.angle ?? 90;
                                    nextTool.tipDiameter = tool.tipDiameter ?? 0.2;
                                  } else {
                                    delete nextTool.angle;
                                    delete nextTool.tipDiameter;
                                  }
                                  newTools[index] = nextTool;
                                  updateDraftStock((current) => ({ ...current, tools: newTools }));
                                }}
                              >
                                <option value="flat">{t.typeFlat}</option>
                                <option value="ball">{t.typeBall}</option>
                                <option value="vbit">{t.typeVBit}</option>
                              </select>
                            </div>
                          </label>
                          <label style={{ flex: 1 }}>
                            <span>{t.lblToolDia}</span>
                            <div>
                              <input
                                type="number"
                                step="0.1"
                                value={tool.diameter}
                                onChange={(e) => {
                                  const newTools = [...(settingsDraft.stock.tools || [])];
                                  newTools[index] = { ...tool, diameter: Number(e.target.value) || 0 };
                                  updateDraftStock((current) => ({ ...current, tools: newTools }));
                                }}
                              />
                              <small>mm</small>
                            </div>
                          </label>
                          {tool.type === "vbit" && (
                            <>
                              <label style={{ flex: 1 }}>
                                <span>{t.toolAngle}</span>
                                <div>
                                  <input
                                    type="number"
                                    min="1"
                                    max="179"
                                    step="1"
                                    value={tool.angle ?? 90}
                                    onChange={(e) => {
                                      const newTools = [...(settingsDraft.stock.tools || [])];
                                      newTools[index] = { ...tool, angle: Number(e.target.value) || 90 };
                                      updateDraftStock((current) => ({ ...current, tools: newTools }));
                                    }}
                                  />
                                  <small>°</small>
                                </div>
                              </label>
                              <label style={{ flex: 1 }}>
                                <span>{t.toolTipDiameter}</span>
                                <div>
                                  <input
                                    type="number"
                                    min="0"
                                    max={Math.max(0, tool.diameter - 0.01)}
                                    step="0.01"
                                    value={tool.tipDiameter ?? 0}
                                    onChange={(e) => {
                                      const newTools = [...(settingsDraft.stock.tools || [])];
                                      newTools[index] = {
                                        ...tool,
                                        tipDiameter: Math.max(0, Number(e.target.value) || 0),
                                      };
                                      updateDraftStock((current) => ({ ...current, tools: newTools }));
                                    }}
                                  />
                                  <small>mm</small>
                                </div>
                                <small className="tool-geometry-hint">
                                  {t.toolVDepth}: {resolveVBitGeometry(tool).taperHeight.toFixed(2)} mm
                                </small>
                              </label>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn-delete-tool"
                            title={t.deleteTool}
                            onClick={() => {
                              const newTools = [...(settingsDraft.stock.tools || [])];
                              newTools.splice(index, 1);
                              updateDraftStock((current) => ({ ...current, tools: newTools }));
                            }}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="tool-library-actions-v2">
                      <button
                        type="button"
                        className="tool-action-card-btn"
                        onClick={() => {
                          updateDraftStock((current) => ({
                            ...current,
                            tools: [
                              ...(current.tools || []),
                              {
                                id: `${(current.tools?.length || 0) + 1}`,
                                diameter: 6,
                                type: "flat",
                              },
                            ],
                          }));
                        }}
                      >
                        <span className="tool-action-card-icon">
                          <Icon name="plus" size={16} />
                        </span>
                        <div>
                          <span className="tool-action-card-title">{t.addTool}</span>
                          <span className="tool-action-card-desc">
                            {lang === "EN" ? "Flat end mill Ø6mm" : "Dao phay ngón chuẩn D6"}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className="tool-action-card-btn is-vbit-card"
                        onClick={() => {
                          updateDraftStock((current) => ({
                            ...current,
                            tools: [
                              ...(current.tools || []),
                              {
                                id: `${(current.tools?.length || 0) + 1}`,
                                diameter: 12.7,
                                type: "vbit",
                                angle: 90,
                                tipDiameter: 0.2,
                              },
                            ],
                          }));
                        }}
                      >
                        <span className="tool-action-card-icon">
                          <Icon name="sparkles" size={16} />
                        </span>
                        <div>
                          <span className="tool-action-card-title">{t.addVBit}</span>
                          <span className="tool-action-card-desc">
                            {lang === "EN" ? "Engraving & Chamfering" : "Khắc chữ & vát mép 90°"}
                          </span>
                        </div>
                      </button>
                      
                      <button
                        type="button"
                        className="tool-action-card-btn is-primary-detect"
                        title="Phát hiện dao từ G-code"
                        onClick={() => {
                          const detected = new Set<string>();
                          simulation.segments.forEach(seg => {
                            if (seg.tool) detected.add(String(seg.tool));
                          });
                          
                          const newTools = [...(settingsDraft.stock.tools || [])];
                          let addedCount = 0;
                          
                          detected.forEach(tId => {
                            if (!newTools.find(t => String(t.id) === tId)) {
                              newTools.push({ id: tId, diameter: 6, type: "flat" });
                              addedCount++;
                            }
                          });
                          
                          if (addedCount > 0) {
                            updateDraftStock((current) => ({ ...current, tools: newTools }));
                          } else if (detected.size === 0) {
                            notify(t.noToolsDetectedMsg);
                          }
                        }}
                      >
                        <span className="tool-action-card-icon">
                          <Icon name="zap" size={16} />
                        </span>
                        <div>
                          <span className="tool-action-card-title">{t.autoDetectTool}</span>
                          <span className="tool-action-card-desc">
                            {lang === "EN" ? "Scan T-codes from file" : "Quét mã dao T từ G-code"}
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: SAFETY & WCS G54-G59 */}
              {settingsTab === "safety" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Safety Speeds & Heights */}
                  <div className="settings-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    <label>
                      <span>{t.lblSafeZ}</span>
                      <div>
                        <input
                          type="number"
                          step="0.5"
                          value={settingsDraft.stock.safeZ}
                          onChange={(e) => updateDraftStock((cur) => ({ ...cur, safeZ: Number(e.target.value) || 0 }))}
                        />
                        <small>mm</small>
                      </div>
                    </label>
                    <label>
                      <span>{t.lblClearance}</span>
                      <div>
                        <input
                          type="number"
                          step="0.5"
                          value={settingsDraft.stock.clearance}
                          min={0}
                          onChange={(e) => updateDraftStock((cur) => ({ ...cur, clearance: Number(e.target.value) || 0 }))}
                        />
                        <small>mm</small>
                      </div>
                    </label>
                    <label>
                      <span>{t.lblRapidFeed}</span>
                      <div>
                        <input
                          type="number"
                          step="500"
                          value={settingsDraft.stock.rapidFeed}
                          min={100}
                          onChange={(e) => updateDraftStock((cur) => ({ ...cur, rapidFeed: Number(e.target.value) || 1000 }))}
                        />
                        <small>mm/min</small>
                      </div>
                    </label>
                  </div>

                  {/* WCS Table */}
                  <details className="work-offset-settings">
                    <summary>
                      <span>{t.workOffsetsTitle}</span>
                      <small>{t.workOffsetsBadge}</small>
                    </summary>
                    <div className="work-offset-settings__body">
                      <p>{t.workOffsetsDesc}</p>
                      <div className="work-offset-table-wrap">
                        <table aria-label={t.workOffsetsTableLabel}>
                          <thead>
                            <tr>
                              <th scope="col">WCS</th>
                              <th scope="col">X</th>
                              <th scope="col">Y</th>
                              <th scope="col">Z</th>
                            </tr>
                          </thead>
                          <tbody>
                            {WORK_COORDINATE_SYSTEMS.map((coordinateSystem) => (
                              <tr key={coordinateSystem}>
                                <th scope="row">
                                  {coordinateSystem}
                                  {coordinateSystem === "G54" ? (
                                    <small>REF</small>
                                  ) : null}
                                </th>
                                {(["x", "y", "z"] as const).map((axis) => (
                                  <td key={axis}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={workOffsetInputDraft[coordinateSystem][axis]}
                                      aria-label={`${coordinateSystem} ${axis.toUpperCase()}`}
                                      aria-invalid={
                                        parseWorkOffsetInput(
                                          workOffsetInputDraft[coordinateSystem][axis],
                                        ) === null
                                      }
                                      onChange={(event) =>
                                        updateDraftWorkOffset(
                                          coordinateSystem,
                                          axis,
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        type="button"
                        className="ghost-button work-offset-settings__reset"
                        onClick={() => {
                          const zeroWorkOffsets = createZeroWorkspaceWorkOffsets();
                          setSettingsDraft((current) => ({
                            ...current,
                            workOffsets: zeroWorkOffsets,
                          }));
                          setWorkOffsetInputDraft(
                            createWorkOffsetInputDraft(zeroWorkOffsets),
                          );
                        }}
                      >
                        {t.workOffsetsReset}
                      </button>
                    </div>
                  </details>
                </div>
              )}

              {/* TAB 4: APP & SIMULATION PREFERENCES */}
              {settingsTab === "preferences" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <section
                    className="simulation-preferences"
                    aria-labelledby="simulation-preferences-title"
                    style={{ margin: 0 }}
                  >
                    <div className="simulation-preferences__heading">
                      <Icon name="settings" size={18} />
                      <div>
                        <strong id="simulation-preferences-title">
                          {t.preferenceTitle}
                        </strong>
                        <small>{t.preferenceDescription}</small>
                      </div>
                    </div>
                    <div className="simulation-preferences__grid">
                      <label>
                        <span>{t.profileLabel}</span>
                        <select
                          value={settingsDraft.profile}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              profile: event.target.value as MachineProfile,
                            }))
                          }
                        >
                          <option value="router-custom">{t.routerCustom}</option>
                          <option value="iso">{t.isoBasic}</option>
                        </select>
                      </label>
                      <label>
                        <span>{t.speedControl}</span>
                        <select
                          value={settingsDraft.speed}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              speed: Number(event.target.value),
                            }))
                          }
                        >
                          {[0.5, 1, 2, 5, 10, 20].map((option) => (
                            <option value={option} key={option}>
                              {option}×
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{t.configLabel}</span>
                        <select
                          value={settingsDraft.quality}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              quality: event.target.value as SimulationQuality,
                            }))
                          }
                        >
                          <option value="low">{t.perfLow}</option>
                          <option value="medium">{t.perfMedium}</option>
                          <option value="high">{t.perfHigh}</option>
                        </select>
                      </label>
                    </div>
                    <div className="simulation-preferences__toggles">
                      {([
                        ["showRapids", t.showRapidPreference],
                        ["machineSound", t.machineSoundLabel],
                        ["finishSound", t.finishSoundLabel],
                      ] as const).map(([key, label]) => (
                        <label className="settings-option" key={key}>
                          <input
                            type="checkbox"
                            checked={settingsDraft[key]}
                            onChange={(event) =>
                              setSettingsDraft((current) => ({
                                ...current,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  {/* 3D Machine Experimental */}
                  <section
                    className="experimental-settings"
                    aria-labelledby="experimental-settings-title"
                  >
                    <div className="experimental-settings__header">
                      <span className="experimental-settings__icon" aria-hidden="true">
                        <Icon name="cube" size={18} />
                      </span>
                      <div>
                        <strong id="experimental-settings-title">
                          {t.experimentalTitle}
                        </strong>
                        <p id="machine3d-experimental-description">
                          {t.machine3DDesc}
                        </p>
                      </div>
                      <span className="experimental-settings__badge">
                        {t.experimentalBadge}
                      </span>
                    </div>
                    <label className="experimental-toggle">
                      <span>
                        <strong>{t.machine3DTitle}</strong>
                        <small>
                          {machineViewEnabled
                            ? t.machine3DEnabled
                            : t.machine3DDisabled}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={machineViewEnabled}
                        onChange={(event) => toggleMachineView(event.target.checked)}
                        aria-label={t.machine3DTitle}
                        aria-describedby="machine3d-experimental-description"
                      />
                      <i className="experimental-toggle__switch" aria-hidden="true" />
                    </label>
                  </section>

                  <div className="profile-note">
                    <Icon name="info" size={20} />
                    <p>
                      <b>Router Custom:</b> {t.routerNote}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const defaults = createDefaultWorkspacePreferences();
                  setSettingsDraft(defaults);
                  setWorkOffsetInputDraft(
                    createWorkOffsetInputDraft(defaults.workOffsets),
                  );
                }}
              >
                {t.restoreDefault}
              </button>
              <button
                type="button"
                className="accent-button"
                onClick={applySettings}
              >
                {t.applyRecalc}
              </button>
            </div>
        </ResponsiveDialog>
      )}
      {editorOpen && (
        <ResponsiveDialog
          className="code-editor-modal"
          size="large"
          height="tall"
          titleId="code-editor-dialog-title"
          onClose={() => setEditorOpen(false)}
        >
            <div className="modal-header">
              <div>
                <small>{t.editorTitle}</small>
                <h2 id="code-editor-dialog-title">{fileName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label={lang === "EN" ? "Close" : "Đóng"}
              >
                <Icon name="close" />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <GcodeEditor
                t={t}
                gcode={draftCode}
                onChange={(newCode) => setDraftCode(newCode)}
                currentLineNumber={activeSegment?.lineNumber}
                onSeekToLine={(lineNum) => seekToLine(lineNum - 1)}
                breakpoints={breakpoints}
                onToggleBreakpoint={toggleBreakpoint}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: "12px" }}>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDraftCode(SAMPLE_GCODE)}
              >
                {t.reloadSample}
              </button>
              <button
                type="button"
                className="accent-button"
                disabled={isPreparingProgram}
                onClick={async () => {
                  const rotated = await applyCode(draftCode);
                  if (rotated === null) return;
                  setEditorOpen(false);
                  notify(
                    rotated
                      ? (lang === "EN" ? "Re-parsed G-code and automatically rotated stock orientation." : "Đã dịch lại G-code và tự xoay chiều phôi cho đúng tọa độ.")
                      : (lang === "EN" ? "Re-parsed G-code and updated simulation." : "Đã dịch lại G-code và cập nhật mô phỏng."),
                  );
                }}
              >
                {t.parseSimulate}
              </button>
            </div>
        </ResponsiveDialog>
      )}

      {isGuideOpen && <UserGuideModal t={t} onClose={() => setIsGuideOpen(false)} />}

      {setupSheetOpen && (
        <JobSetupSheetModal
          t={t}
          simulation={simulation}
          stock={stock}
          machineProfile={profile}
          programName={fileName}
          onClose={() => setSetupSheetOpen(false)}
        />
      )}

      {cncControllerOpen && (
        <CncControllerModal
          t={t}
          gcode={code}
          onClose={() => setCncControllerOpen(false)}
        />
      )}

      {compareOpen && (
        <FileCompareModal 
          t={t} 
          currentCode={code} 
          onClose={() => setCompareOpen(false)} 
          onApply={(newCode) => {
            void applyCode(newCode).then((result) => {
              if (result === null) return;
              setCompareOpen(false);
              notify("Đã áp dụng thay đổi từ File Compare.");
            });
          }} 
        />
      )}
      
      {minicamOpen && (
        <MiniCamModal
          t={t}
          onClose={() => setMinicamOpen(false)}
          onGenerate={(generatedCode) => {
            const newCode = code ? `${code}\n${generatedCode}` : generatedCode;
            void applyCode(newCode).then((result) => {
              if (result === null) return;
              setMinicamOpen(false);
              notify("Đã sinh G-Code và chèn vào Editor.");
            });
          }}
        />
      )}

      {soundMenuOpen &&
        createPortal(
          <div
            ref={soundPopoverRef}
            className="sound-settings-popover is-viewport"
            id="sound-settings-popover"
            role="group"
            aria-label={lang === "EN" ? "Sound settings" : "Thiết lập âm thanh"}
            style={{ left: soundMenuPosition.left, top: soundMenuPosition.top }}
          >
            <label>
              <input
                type="checkbox"
                checked={machineSound}
                onChange={async (event) => {
                  const enabled = event.target.checked;
                  if (enabled && !(await ensureAudio())) {
                    setMachineSound(false);
                    notify(t.audioUnavailableMsg);
                    return;
                  }
                  setMachineSound(enabled);
                  if (!enabled) cncAudio.stopAll();
                }}
              />
              {t.machineSoundLabel}
            </label>
            <label>
              <input
                type="checkbox"
                checked={finishSound}
                onChange={async (event) => {
                  const enabled = event.target.checked;
                  if (enabled && !(await ensureAudio())) {
                    setFinishSound(false);
                    notify(t.audioUnavailableMsg);
                    return;
                  }
                  setFinishSound(enabled);
                }}
              />
              {t.finishSoundLabel}
            </label>
          </div>,
          document.body,
        )}

      {dragActive && (
        <div className="drop-overlay">
          <Icon name="upload" size={44} />
          <strong>{t.dropTitle}</strong>
          <span>{t.dropSub}</span>
        </div>
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </main>
  );
}

