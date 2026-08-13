import type { Plane, PostProcessorType, Segment, Simulation, Vec3 } from "./types";

const POSITION_EPSILON = 0.0005;

type ControllerTarget = Exclude<PostProcessorType, "standard">;

export function exportCAM(
  simulation: Simulation,
  target: PostProcessorType,
  projectName: string,
  lang: "VN" | "EN" = "VN",
): string {
  if (target === "standard") {
    return simulation.lines.join("\n");
  }

  const lines = controllerHeader(target, safeComment(projectName));
  const clearanceZ = exportClearanceZ(simulation.segments);
  let outputPosition: Vec3 | null = null;
  let currentPlane: Plane = "XY";
  let currentTool: string | null = null;
  let currentSpindle = 0;

  const retractToClearance = () => {
    if (!outputPosition || !nearlyEqual(outputPosition.z, clearanceZ)) {
      lines.push(`G00 Z${numberWord(clearanceZ)}`);
      outputPosition = outputPosition
        ? { ...outputPosition, z: clearanceZ }
        : null;
    }
  };

  const positionAt = (point: Vec3) => {
    if (outputPosition && samePoint(outputPosition, point)) return;
    retractToClearance();
    if (
      !outputPosition ||
      !nearlyEqual(outputPosition.x, point.x) ||
      !nearlyEqual(outputPosition.y, point.y)
    ) {
      lines.push(`G00 X${numberWord(point.x)} Y${numberWord(point.y)}`);
    }
    if (!nearlyEqual(clearanceZ, point.z)) {
      lines.push(`G00 Z${numberWord(point.z)}`);
    }
    outputPosition = { ...point };
  };

  for (const segment of simulation.segments) {
    if (segment.kind === "dwell") {
      lines.push(`G04 P${Math.max(0, Math.round(segment.estimatedDurationMs))}`);
      continue;
    }

    const toolNumber = parseToolNumber(segment.tool);
    if (toolNumber !== null && segment.tool !== currentTool) {
      retractToClearance();
      lines.push(
        lang === "EN"
          ? `; --- TOOL CHANGE TO T${toolNumber} ---`
          : `; --- ĐỔI DAO SANG T${toolNumber} ---`,
        "M05",
        `T${toolNumber} M06`,
      );
      if (target === "syntec") {
        lines.push(`G43 H${toolNumber} Z${numberWord(clearanceZ)}`);
      }
      currentTool = `T${toolNumber}`;
      currentSpindle = 0;
    }

    if (segment.machineCoordinates) {
      const code = segment.kind === "rapid" ? "G00" : "G01";
      const feed = code === "G01" ? feedWord(segment.feed) : "";
      lines.push(
        `G53 ${code} ${pointWords(segment.machineEnd)}${feed}`,
      );
      outputPosition = null;
      continue;
    }

    positionAt(segment.start);

    if (segment.kind !== "rapid" && segment.spindle > 0) {
      const spindle = Math.round(segment.spindle);
      if (spindle !== currentSpindle) {
        lines.push(`S${spindle} M03`);
        currentSpindle = spindle;
      }
    }

    if (segment.kind === "rapid") {
      lines.push(`G00 ${pointWords(segment.end)}`);
    } else if (segment.kind === "cut" || segment.kind === "drill") {
      // Canned cycles are already expanded by the interpreter. Re-emitting G81
      // here would duplicate holes and lose the exact retract/peck trajectory.
      lines.push(`G01 ${pointWords(segment.end)}${feedWord(segment.feed)}`);
    } else if (segment.kind === "arc-cw" || segment.kind === "arc-ccw") {
      if (!segment.center) {
        for (const point of segment.points.slice(1)) {
          lines.push(`G01 ${pointWords(point)}${feedWord(segment.feed)}`);
        }
      } else {
        if (segment.plane !== currentPlane) {
          lines.push(planeCode(segment.plane));
          currentPlane = segment.plane;
        }
        const code = segment.kind === "arc-cw" ? "G02" : "G03";
        lines.push(
          `${code} ${pointWords(segment.end)} ${centerWords(segment)}${feedWord(segment.feed)}`,
        );
      }
    }
    outputPosition = { ...segment.end };
  }

  retractToClearance();
  lines.push(
    "; --- PROGRAM END ---",
    "G90",
    `G00 Z${numberWord(clearanceZ)}`,
    "G00 X0.000 Y0.000",
    "M05",
    target === "syntec" ? "M30" : "M02",
    "%",
  );

  return lines.join("\n");
}

function controllerHeader(target: ControllerTarget, projectName: string): string[] {
  const lines = ["%"];
  if (target === "syntec") {
    lines.push(
      `O1001 (LAX STUDIO - ${projectName})`,
      "; ==========================================",
      "; CONTROLLER: TAIWAN SYNTEC ATC NESTING 6000i",
      "; UNITS: MM | WORK OFFSET: G54",
      "; ==========================================",
    );
  } else {
    lines.push(
      "; ==========================================",
      `; LAX STUDIO - ${projectName}`,
      "; CONTROLLER: WEIHONG NCSTUDIO V15 (METRIC)",
      "; UNITS: MM | ABSOLUTE G90",
      "; ==========================================",
    );
  }
  lines.push("G21 G90 G54 G17 G40 G49 G80");
  return lines;
}

function exportClearanceZ(segments: readonly Segment[]): number {
  let highest = 0;
  for (const segment of segments) {
    if (segment.machineCoordinates) continue;
    highest = Math.max(highest, segment.start.z, segment.end.z);
  }
  return Math.max(50, highest + 5);
}

function planeCode(plane: Plane): string {
  if (plane === "XZ") return "G18";
  if (plane === "YZ") return "G19";
  return "G17";
}

function centerWords(segment: Segment): string {
  const center = segment.center ?? segment.start;
  if (segment.plane === "XZ") {
    return `I${numberWord(center.x - segment.start.x)} K${numberWord(center.z - segment.start.z)}`;
  }
  if (segment.plane === "YZ") {
    return `J${numberWord(center.y - segment.start.y)} K${numberWord(center.z - segment.start.z)}`;
  }
  return `I${numberWord(center.x - segment.start.x)} J${numberWord(center.y - segment.start.y)}`;
}

function pointWords(point: Vec3): string {
  return `X${numberWord(point.x)} Y${numberWord(point.y)} Z${numberWord(point.z)}`;
}

function feedWord(feed: number): string {
  return feed > 0 ? ` F${numberWord(feed, 1)}` : "";
}

function parseToolNumber(tool: string): number | null {
  const match = /^T(\d+)$/i.exec(tool.trim());
  return match ? Number(match[1]) : null;
}

function safeComment(value: string): string {
  return value
    .toUpperCase()
    .replace(/[();\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function numberWord(value: number, digits = 3): string {
  const normalized = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return normalized.toFixed(digits);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= POSITION_EPSILON;
}

function samePoint(a: Vec3, b: Vec3): boolean {
  return (
    nearlyEqual(a.x, b.x) &&
    nearlyEqual(a.y, b.y) &&
    nearlyEqual(a.z, b.z)
  );
}
