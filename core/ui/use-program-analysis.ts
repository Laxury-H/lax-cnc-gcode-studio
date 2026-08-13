import { useCallback, useEffect, useRef, useState } from "react";

import type { InterpreterOptions } from "../gcode/types";
import {
  orientStockForProgram,
  parseProgram,
} from "../simulation/studio-program";
import type {
  Simulation,
  StockSettings,
  StudioMachineProfile,
} from "../simulation/types";
import type {
  ProgramAnalysisRequest,
  ProgramAnalysisResponse,
} from "../workers/program-analysis.worker";

type AnalysisInput = {
  source: string;
  stock: StockSettings;
  profile: StudioMachineProfile;
  workOffsets: InterpreterOptions["workOffsets"];
};

type PreparedProgram = {
  simulation: Simulation;
  stock: StockSettings;
  rotated: boolean;
};

let requestSequence = 0;

function createAnalysisWorker(): Worker {
  return new Worker(
    new URL("../workers/program-analysis.worker.ts", import.meta.url),
    { type: "module", name: "lax-cnc-program-analysis" },
  );
}

export function prepareProgramOffThread(
  input: AnalysisInput,
  signal?: AbortSignal,
): Promise<PreparedProgram> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Program analysis cancelled", "AbortError"));
  }
  if (typeof Worker === "undefined") {
    const oriented = orientStockForProgram(
      input.source,
      input.stock,
      input.profile,
      input.workOffsets,
    );
    return Promise.resolve({
      stock: oriented.stock,
      rotated: oriented.rotated,
      simulation: parseProgram(
        input.source,
        oriented.stock,
        input.profile,
        input.workOffsets,
      ),
    });
  }
  const worker = createAnalysisWorker();
  const id = ++requestSequence;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Program analysis cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    worker.onmessage = (event: MessageEvent<ProgramAnalysisResponse>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error || !event.data.simulation || !event.data.stock) {
        reject(new Error(event.data.error ?? "PROGRAM_ANALYSIS_FAILED"));
        return;
      }
      resolve({
        simulation: event.data.simulation,
        stock: event.data.stock,
        rotated: event.data.rotated ?? false,
      });
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("PROGRAM_ANALYSIS_WORKER_FAILED"));
    };
    worker.postMessage({
      id,
      mode: "orient-and-parse",
      ...input,
    } satisfies ProgramAnalysisRequest);
  });
}

export function useProgramAnalysis(input: AnalysisInput) {
  const { source, stock, profile, workOffsets } = input;
  const [simulation, setSimulation] = useState(() =>
    parseProgram(source, stock, profile, workOffsets),
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRender = useRef(true);
  const workerRef = useRef<Worker | null>(null);
  const activeRequest = useRef(0);
  const preparedInput = useRef<AnalysisInput | null>(null);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const prepared = preparedInput.current;
    if (
      prepared &&
      prepared.source === source &&
      prepared.stock === stock &&
      prepared.profile === profile &&
      prepared.workOffsets === workOffsets
    ) {
      preparedInput.current = null;
      setIsProcessing(false);
      setError(null);
      return;
    }
    const id = ++requestSequence;
    activeRequest.current = id;
    setIsProcessing(true);
    setError(null);

    if (typeof Worker === "undefined") {
      const timeout = window.setTimeout(() => {
        try {
          setSimulation(
            parseProgram(source, stock, profile, workOffsets),
          );
        } catch (parseError) {
          setError(
            parseError instanceof Error ? parseError.message : "PROGRAM_ANALYSIS_FAILED",
          );
        } finally {
          setIsProcessing(false);
        }
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const worker = createAnalysisWorker();
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<ProgramAnalysisResponse>) => {
      if (event.data.id !== activeRequest.current) return;
      if (event.data.simulation) setSimulation(event.data.simulation);
      setError(event.data.error ?? null);
      setIsProcessing(false);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.onerror = () => {
      if (id !== activeRequest.current) return;
      setError("PROGRAM_ANALYSIS_WORKER_FAILED");
      setIsProcessing(false);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.postMessage({
      id,
      mode: "parse",
      source,
      stock,
      profile,
      workOffsets,
    } satisfies ProgramAnalysisRequest);

    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [profile, source, stock, workOffsets]);

  const cancel = useCallback(() => {
    activeRequest.current = ++requestSequence;
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsProcessing(false);
  }, []);

  const acceptPrepared = useCallback(
    (prepared: PreparedProgram, preparedFor: AnalysisInput) => {
      activeRequest.current = ++requestSequence;
      workerRef.current?.terminate();
      workerRef.current = null;
      preparedInput.current = preparedFor;
      setSimulation(prepared.simulation);
      setError(null);
      setIsProcessing(false);
    },
    [],
  );

  return { simulation, isProcessing, error, cancel, acceptPrepared };
}
