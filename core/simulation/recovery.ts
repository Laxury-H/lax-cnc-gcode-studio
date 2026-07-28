import type { Simulation } from "./types";

/**
 * Generates a safe G-Code recovery script to resume machining after a failure, tool breakage, or power loss.
 * Extracts modal state right before the interruption point, injects a safe approach sequence,
 * and resumes program execution cleanly.
 */
export function generateSmartResume(
  simulation: Simulation,
  errorSegmentId: number,
  safeZ: number,
  lang: "VN" | "EN" = "VN",
): string {
  if (!simulation.segments.length || errorSegmentId < 0) {
    return lang === "EN"
      ? "( Error: Program segment for recovery not found )\n%"
      : "( Lỗi: Không tìm thấy phân đoạn chương trình để phục hồi )\n%";
  }

  const clampedId = Math.min(errorSegmentId, simulation.segments.length - 1);
  const segment = simulation.segments[clampedId];
  const start = segment.start;
  const feed = segment.feed || 1000;
  const spindle = segment.spindle || 18000;
  const tool = segment.tool && segment.tool !== "—" ? segment.tool : "T1";
  const halfFeed = Math.max(100, Math.round(feed * 0.5));

  const isEn = lang === "EN";

  const recoveryLines: string[] = [
    "%",
    "(==============================================================)",
    isEn
      ? "( Lax's CNC - SMART RESUME RECOVERY )"
      : "( Lax's CNC - SMART RESUME / PHỤC HỒI CẮT DỞ )",
    isEn
      ? `( INTERRUPTION AT LINE: ${segment.lineNumber} / SEGMENT #${clampedId + 1} )`
      : `( PHÁT HIỆN DỪNG TẠI DÒNG SỐ: ${segment.lineNumber} / PHÂN ĐOẠN #${clampedId + 1} )`,
    isEn
      ? `( SAFE CLEARANCE HEIGHT: Z = ${safeZ.toFixed(3)} mm )`
      : `( ĐỘ CAO AN TOÀN: Z = ${safeZ.toFixed(3)} mm )`,
    "(==============================================================)",
    isEn
      ? "G90 G21 G17 G54 G80 (Restore standard absolute coordinates)"
      : "G90 G21 G17 G54 G80 (Khôi phục hệ tọa độ tuyệt đối chuẩn)",
    isEn
      ? `G0 Z${safeZ.toFixed(3)} (Retract tool to safe clearance height)`
      : `G0 Z${safeZ.toFixed(3)} (Rút dao lên độ cao an toàn tuyệt đối)`,
    isEn
      ? `${tool} M6 (Select and call active tool)`
      : `${tool} M6 (Gọi lại công cụ thi công)`,
    isEn
      ? `M3 S${spindle} (Start spindle clockwise)`
      : `M3 S${spindle} (Khởi động trục chính)`,
    isEn
      ? `G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} (Rapid move above interruption point)`
      : `G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} (Chạy nhanh đến vị trí ngay trước điểm dừng)`,
    isEn
      ? `G1 Z${start.z.toFixed(3)} F${halfFeed.toFixed(1)} (Slow Z approach at 50% feedrate)`
      : `G1 Z${start.z.toFixed(3)} F${halfFeed.toFixed(1)} (Tiếp cận chậm xuống Z tại 50% tốc độ)`,
    isEn
      ? `F${feed.toFixed(1)} (Restore active machining feedrate)`
      : `F${feed.toFixed(1)} (Khôi phục tốc độ tiến dao chuẩn)`,
    "(==============================================================)",
    isEn
      ? `( RESUME PROGRAM EXECUTION FROM LINE ${segment.lineNumber} )`
      : `( BẮT ĐẦU TIẾP TỤC CHƯƠNG TRÌNH TỪ DÒNG ${segment.lineNumber} )`,
    "(==============================================================)",
  ];

  // Append remaining source lines starting from the line index of the error segment
  const remainingLines = simulation.lines.slice(segment.lineIndex);
  for (const line of remainingLines) {
    if (line.trim() !== "%") {
      recoveryLines.push(line);
    }
  }

  recoveryLines.push("%");
  return recoveryLines.join("\n");
}
