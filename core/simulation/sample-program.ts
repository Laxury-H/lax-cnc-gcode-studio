function buildSampleProgram(): string {
  const panels = [
    [20, 20, 720, 380],
    [20, 420, 720, 360],
    [760, 20, 680, 380],
    [760, 420, 680, 360],
    [1460, 20, 600, 220],
    [1460, 260, 285, 200],
    [1755, 260, 305, 200],
    [2080, 20, 340, 1120],
    [1460, 480, 285, 260],
    [1755, 480, 305, 260],
    [1460, 760, 285, 380],
    [1755, 760, 305, 380],
  ];
  const lines = [
    "%",
    "(Lax's CNC - TU BEP CAN A-01)",
    "(PHOI 2440 X 1220 X 18)",
    "G90 G21 G17",
    "G54",
    "M33 S18000",
    "G600 T25",
    "M73",
    "G0 Z22.000",
  ];

  panels.forEach(([x, y, width, height], index) => {
    const x2 = x + width;
    const y2 = y + height;
    lines.push(
      `(P${String(index + 1).padStart(2, "0")} - ${width} X ${height})`,
      `G0 X${x.toFixed(3)} Y${y.toFixed(3)}`,
      "G1 Z7.000 F1000.0",
      `G1 X${x2.toFixed(3)} Y${y.toFixed(3)} F3200.0`,
      `G1 X${x2.toFixed(3)} Y${y2.toFixed(3)}`,
      `G1 X${x.toFixed(3)} Y${y2.toFixed(3)}`,
      `G1 X${x.toFixed(3)} Y${y.toFixed(3)}`,
      "G0 Z22.000",
    );
  });
  lines.push(
    "(KHOAN BAN LE)",
    "G81 X60.000 Y70.000 Z7.000 R22.000 F1000.0",
    "X700.000 Y70.000",
    "X60.000 Y350.000",
    "X700.000 Y350.000",
    "G80",
    "M83",
    "M5",
    "M30",
    "%",
  );
  return lines.join("\n");
}

export const SAMPLE_GCODE = buildSampleProgram();
