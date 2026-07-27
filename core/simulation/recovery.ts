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
): string {
  if (!simulation.segments.length || errorSegmentId < 0) {
    return "( Lỗi: Không tìm thấy phân đoạn chương trình để phục hồi )\n%";
  }

  const clampedId = Math.min(errorSegmentId, simulation.segments.length - 1);
  const segment = simulation.segments[clampedId];
  const start = segment.start;
  const feed = segment.feed || 1000;
  const spindle = segment.spindle || 18000;
  const tool = segment.tool && segment.tool !== "—" ? segment.tool : "T1";
  const halfFeed = Math.max(100, Math.round(feed * 0.5));

  const recoveryLines: string[] = [
    "%",
    "(==============================================================)",
    "( LAX CNC STUDIO - SMART RESUME / PHỤC HỒI CẮT DỞ )",
    `( PHÁT HIỆN DỪNG TẠI DÒNG SỐ: ${segment.lineNumber} / PHÂN ĐOẠN #${clampedId + 1} )`,
    `( ĐỘ CAO AN TOÀN: Z = ${safeZ.toFixed(3)} mm )`,
    "(==============================================================)",
    "G90 G21 G17 G54 G80 (Khôi phục hệ tọa độ tuyệt đối chuẩn)",
    `G0 Z${safeZ.toFixed(3)} (Rút dao lên độ cao an toàn tuyệt đối)`,
    `${tool} M6 (Gọi lại công cụ thi công)`,
    `M3 S${spindle} (Khởi động trục chính)`,
    `G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} (Chạy nhanh đến vị trí ngay trước điểm dừng)`,
    `G1 Z${start.z.toFixed(3)} F${halfFeed.toFixed(1)} (Tiếp cận chậm xuống Z tại 50% tốc độ)`,
    `F${feed.toFixed(1)} (Khôi phục tốc độ tiến dao chuẩn)`,
    "(==============================================================)",
    `( BẮT ĐẦU TIẾP TỤC CHƯƠNG TRÌNH TỪ DÒNG ${segment.lineNumber} )`,
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
