import type { PostProcessorType, Simulation } from "./types";

export function exportCAM(
  simulation: Simulation,
  target: PostProcessorType,
  projectName: string,
): string {
  if (target === "standard") {
    return simulation.lines.join("\n");
  }

  const lines: string[] = ["%"];
  const isSyntec = target === "syntec";

  if (isSyntec) {
    lines.push(
      `O1001 (LAX STUDIO - ${projectName.toUpperCase()})`,
      "; ==========================================",
      "; CONTROLLER: TAIWAN SYNTEC ATC NESTING 6000i",
      "; UNITS: MM | WORK OFFSET: G54",
      "; ==========================================",
      "G90 G54 G17 G40 G49 G80",
      "G91 G28 Z0. (HOME Z AXIS FOR ATC SAFETY)",
      "G90",
      "S18000 M03",
    );
  } else {
    // NcStudio
    lines.push(
      "; ==========================================",
      `; LAX STUDIO - ${projectName.toUpperCase()}`,
      "; CONTROLLER: WEIHONG NCSTUDIO V15 (METRIC)",
      "; UNITS: MM | ABSOLUTE G90",
      "; ==========================================",
      "G90 G54 G17 G40 G49 G80",
      "G00 Z50.000",
      "S18000 M03",
    );
  }

  let currentTool = "—";

  for (const seg of simulation.segments) {
    if (seg.tool && seg.tool !== currentTool && seg.tool !== "—") {
      currentTool = seg.tool;
      const toolNum = seg.tool.replace("T", "");
      lines.push(`; --- ĐỔI DAO SANG ${seg.tool} ---`);
      if (isSyntec) {
        lines.push(
          "M05",
          `T${toolNum} M06`,
          `G43 H${toolNum} Z50.`,
          "S18000 M03",
        );
      } else {
        lines.push(`T${toolNum} M06 (SELECT TOOL ${seg.tool})`);
      }
    }

    const x = seg.end.x.toFixed(3);
    const y = seg.end.y.toFixed(3);
    const z = seg.end.z.toFixed(3);
    const f = seg.feed ? ` F${seg.feed.toFixed(1)}` : "";

    if (seg.kind === "rapid") {
      lines.push(`G00 X${x} Y${y} Z${z}`);
    } else if (seg.kind === "cut") {
      lines.push(`G01 X${x} Y${y} Z${z}${f}`);
    } else if (seg.kind === "arc-cw" || seg.kind === "arc-ccw") {
      const code = seg.kind === "arc-cw" ? "G02" : "G03";
      const center = seg.center || { x: seg.start.x, y: seg.start.y, z: seg.start.z };
      const i = (center.x - seg.start.x).toFixed(3);
      const j = (center.y - seg.start.y).toFixed(3);
      lines.push(`${code} X${x} Y${y} Z${z} I${i} J${j}${f}`);
    } else if (seg.kind === "drill") {
      lines.push(`G81 X${x} Y${y} Z${z} R2.000 F600.0`);
    } else if (seg.kind === "dwell") {
      lines.push(`G04 P1000`);
    }
  }

  if (isSyntec) {
    lines.push(
      "; --- PROGRAM END ---",
      "G00 Z50.",
      "G91 G28 Z0. (HOME Z AXIS)",
      "G90 G00 X0. Y0. (HOME XY)",
      "M05",
      "M30",
      "%",
    );
  } else {
    lines.push(
      "; --- PROGRAM END ---",
      "G00 Z50.000",
      "G00 X0.000 Y0.000",
      "M05",
      "M02",
      "%",
    );
  }

  return lines.join("\n");
}
