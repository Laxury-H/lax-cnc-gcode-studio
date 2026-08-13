import { orientStockForProgram, parseProgram } from "../simulation/studio-program";
import { programLimitViolation } from "../simulation/program-limits";
import type { InterpreterOptions } from "../gcode/types";
import type {
  Simulation,
  StockSettings,
  StudioMachineProfile,
} from "../simulation/types";

export type ProgramAnalysisRequest = {
  id: number;
  mode: "parse" | "orient-and-parse";
  source: string;
  stock: StockSettings;
  profile: StudioMachineProfile;
  workOffsets: InterpreterOptions["workOffsets"];
};

export type ProgramAnalysisResponse = {
  id: number;
  simulation?: Simulation;
  stock?: StockSettings;
  rotated?: boolean;
  error?: string;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<ProgramAnalysisRequest>) => void) | null;
  postMessage: (message: ProgramAnalysisResponse) => void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  const request = event.data;
  try {
    const violation = programLimitViolation(request.source);
    if (violation) {
      throw new RangeError(`PROGRAM_LIMIT_${violation.toUpperCase()}`);
    }
    if (request.mode === "orient-and-parse") {
      const oriented = orientStockForProgram(
        request.source,
        request.stock,
        request.profile,
        request.workOffsets,
      );
      workerScope.postMessage({
        id: request.id,
        stock: oriented.stock,
        rotated: oriented.rotated,
        simulation: parseProgram(
          request.source,
          oriented.stock,
          request.profile,
          request.workOffsets,
        ),
      });
      return;
    }
    workerScope.postMessage({
      id: request.id,
      simulation: parseProgram(
        request.source,
        request.stock,
        request.profile,
        request.workOffsets,
      ),
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "PROGRAM_ANALYSIS_FAILED",
    });
  }
};
