import type {
  MeasurementConstraint,
  SnapKind,
} from "./measurement-utils";

export type MeasurementLanguage = "VN" | "EN";

type MeasurementCopy = {
  locale: string;
  snapKinds: Record<SnapKind, string>;
  constraintLabels: Record<MeasurementConstraint, string>;
  constraintTitles: Record<MeasurementConstraint, string>;
  resultConstraintLabels: Record<MeasurementConstraint, string>;
  panelLabel: string;
  panelTitle: string;
  panelSubtitle: (coordinateSystem: string) => string;
  stageDone: string;
  stageSelectA: string;
  stageSelectB: string;
  switchUnit: (unit: "mm" | "in") => string;
  unitTitle: string;
  close: string;
  currentSnap: string;
  coordinateSystemTitle: string;
  progress: string;
  selectPointA: string;
  selectPointB: string;
  snap: string;
  undo: string;
  newMeasurement: string;
  datumTitle: (coordinateSystem: string) => string;
  directionLock: string;
  pointB: string;
  noSnap: string;
  hoverPrompt: string;
  copied: string;
  copy: string;
  horizontal: string;
  angleXY: string;
  inclination: string;
  clipboardAngle: (angle: string, inclination: string) => string;
  selectedPointHint: string;
  startHint: (coordinateSystem: string) => string;
  keyboardPoints: string;
  keyboardPointsHint: string;
  search: string;
  searchPlaceholder: string;
  candidateList: string;
  noCandidate: string;
  history: string;
  historyHint: string;
  clearHistory: string;
  noHistory: string;
  quickDimensions: string;
  quickDimensionsHint: string;
  snapCount: (count: string) => string;
  shortcutHint: string;
  freePoint: (planeZ: number) => string;
  programmedDatum: (coordinateSystem: string) => string;
  restoredPointA: string;
  simulatorRegion: string;
  simulatorCanvas: string;
};

const COPY: Record<MeasurementLanguage, MeasurementCopy> = {
  VN: {
    locale: "vi-VN",
    snapKinds: {
      corner: "Góc",
      endpoint: "Đầu mút",
      midpoint: "Trung điểm",
      center: "Tâm",
      free: "Điểm tự do",
    },
    constraintLabels: {
      free: "Tự do",
      x: "Dọc X",
      y: "Dọc Y",
      z: "Dọc Z",
      xy: "Mặt XY",
    },
    constraintTitles: {
      free: "Đo khoảng cách 3D tự do (F)",
      x: "Đo dọc trục X; giữ Y và Z theo điểm A (X)",
      y: "Đo dọc trục Y; giữ X và Z theo điểm A (Y)",
      z: "Đo dọc trục Z; giữ X và Y theo điểm A (Z)",
      xy: "Đo trên mặt phẳng XY; giữ Z theo điểm A (P)",
    },
    resultConstraintLabels: {
      free: "3D",
      x: "Dọc X",
      y: "Dọc Y",
      z: "Dọc Z",
      xy: "Mặt XY",
    },
    panelLabel: "Công cụ đo thông minh 3D",
    panelTitle: "ĐO 3D CNC",
    panelSubtitle: (coordinateSystem) =>
      `Bắt hình học · khóa hướng · tọa độ ${coordinateSystem}`,
    stageDone: "XONG",
    stageSelectA: "CHỌN A",
    stageSelectB: "CHỌN B",
    switchUnit: (unit) => `Đổi sang ${unit === "mm" ? "inch" : "milimét"}`,
    unitTitle: "Đổi đơn vị hiển thị; dữ liệu CNC luôn giữ nguyên theo mm",
    close: "Đóng công cụ đo",
    currentSnap: "Điểm bắt hiện tại",
    coordinateSystemTitle:
      "Hệ tọa độ lập trình đang hoạt động ở cuối chương trình",
    progress: "Tiến trình đo",
    selectPointA: "Chọn điểm A",
    selectPointB: "Chọn điểm B",
    snap: "Bắt điểm",
    undo: "Hoàn tác",
    newMeasurement: "Đo mới",
    datumTitle: (coordinateSystem) =>
      `Dùng X0 Y0 Z0 đang lập trình trong ${coordinateSystem} làm điểm A; bao gồm các bù tọa độ đang hoạt động`,
    directionLock: "Khóa hướng đo",
    pointB: "Điểm B",
    noSnap: "Chưa bắt điểm",
    hoverPrompt: "Di chuột lên hình học để bắt điểm",
    copied: "Đã chép",
    copy: "Chép",
    horizontal: "NGANG",
    angleXY: "GÓC XY",
    inclination: "ĐỘ DỐC",
    clipboardAngle: (angle, inclination) =>
      `Góc XY ${angle} · Độ dốc ${inclination}`,
    selectedPointHint: "Chọn điểm B hoặc khóa hướng đo theo trục máy.",
    startHint: (coordinateSystem) =>
      `Chọn điểm A trên phôi, chi tiết hoặc đường dao; hoặc dùng gốc ${coordinateSystem}.`,
    keyboardPoints: "CHỌN ĐIỂM BẰNG BÀN PHÍM",
    keyboardPointsHint: "Tìm theo tên hoặc tọa độ · Enter để chọn",
    search: "Tìm điểm bắt",
    searchPlaceholder: "Ví dụ: góc, P01, X 720",
    candidateList: "Các điểm bắt hình học có thể chọn",
    noCandidate: "Không tìm thấy điểm bắt phù hợp.",
    history: "LỊCH SỬ",
    historyHint: "Các phép đo gần nhất",
    clearHistory: "Xóa lịch sử",
    noHistory: "Chưa có phép đo nào.",
    quickDimensions: "KÍCH THƯỚC NHANH",
    quickDimensionsHint: "Tùy chọn · phôi & chi tiết",
    snapCount: (count) => `${count} điểm bắt`,
    shortcutHint: "khóa · Esc: hoàn tác",
    freePoint: (planeZ) => `Điểm tự do · Mặt Z ${planeZ.toFixed(3)}`,
    programmedDatum: (coordinateSystem) =>
      `X0 Y0 Z0 lập trình · ${coordinateSystem}`,
    restoredPointA: "Điểm A đã chọn",
    simulatorRegion: "Mô phỏng phôi CNC 3D và công cụ đo",
    simulatorCanvas: "Hình ảnh mô phỏng phôi CNC 3D",
  },
  EN: {
    locale: "en-US",
    snapKinds: {
      corner: "Corner",
      endpoint: "Endpoint",
      midpoint: "Midpoint",
      center: "Center",
      free: "Free point",
    },
    constraintLabels: {
      free: "Free",
      x: "Along X",
      y: "Along Y",
      z: "Along Z",
      xy: "XY plane",
    },
    constraintTitles: {
      free: "Measure a free 3D distance (F)",
      x: "Measure along X; keep Y and Z from point A (X)",
      y: "Measure along Y; keep X and Z from point A (Y)",
      z: "Measure along Z; keep X and Y from point A (Z)",
      xy: "Measure on the XY plane; keep Z from point A (P)",
    },
    resultConstraintLabels: {
      free: "3D",
      x: "Along X",
      y: "Along Y",
      z: "Along Z",
      xy: "XY plane",
    },
    panelLabel: "Smart 3D measurement tool",
    panelTitle: "CNC 3D MEASURE",
    panelSubtitle: (coordinateSystem) =>
      `Geometry snap · direction lock · ${coordinateSystem} coordinates`,
    stageDone: "DONE",
    stageSelectA: "SELECT A",
    stageSelectB: "SELECT B",
    switchUnit: (unit) => `Switch to ${unit === "mm" ? "inches" : "millimetres"}`,
    unitTitle: "Change display units; CNC data always remains in millimetres",
    close: "Close measurement tool",
    currentSnap: "Current snap point",
    coordinateSystemTitle:
      "Program coordinate system active at the end of the program",
    progress: "Measurement progress",
    selectPointA: "Select point A",
    selectPointB: "Select point B",
    snap: "Snap points",
    undo: "Undo",
    newMeasurement: "New measurement",
    datumTitle: (coordinateSystem) =>
      `Use programmed X0 Y0 Z0 in ${coordinateSystem} as point A, including active coordinate offsets`,
    directionLock: "Measurement direction lock",
    pointB: "Point B",
    noSnap: "No snap point",
    hoverPrompt: "Hover over geometry to snap to a point",
    copied: "Copied",
    copy: "Copy",
    horizontal: "HORIZONTAL",
    angleXY: "XY ANGLE",
    inclination: "INCLINATION",
    clipboardAngle: (angle, inclination) =>
      `XY angle ${angle} · Inclination ${inclination}`,
    selectedPointHint: "Select point B or lock the measurement to a machine axis.",
    startHint: (coordinateSystem) =>
      `Select point A on the stock, part or toolpath, or use the ${coordinateSystem} origin.`,
    keyboardPoints: "SELECT A POINT WITH THE KEYBOARD",
    keyboardPointsHint: "Search by name or coordinate · Enter to select",
    search: "Find snap point",
    searchPlaceholder: "Example: corner, P01, X 720",
    candidateList: "Selectable geometry snap points",
    noCandidate: "No matching snap point found.",
    history: "HISTORY",
    historyHint: "Most recent measurements",
    clearHistory: "Clear history",
    noHistory: "No measurements yet.",
    quickDimensions: "QUICK DIMENSIONS",
    quickDimensionsHint: "Optional · stock & parts",
    snapCount: (count) => `${count} snap points`,
    shortcutHint: "lock · Esc: undo",
    freePoint: (planeZ) => `Free point · Z plane ${planeZ.toFixed(3)}`,
    programmedDatum: (coordinateSystem) =>
      `Programmed X0 Y0 Z0 · ${coordinateSystem}`,
    restoredPointA: "Selected point A",
    simulatorRegion: "3D CNC stock simulation and measurement tool",
    simulatorCanvas: "3D CNC stock simulation view",
  },
};

export function getMeasurementCopy(lang: MeasurementLanguage): MeasurementCopy {
  return COPY[lang];
}

const LABEL_PAIRS: readonly (readonly [vietnamese: string, english: string])[] = [
  ["Điểm tự do · Mặt Z ", "Free point · Z plane "],
  ["X0 Y0 Z0 lập trình · ", "Programmed X0 Y0 Z0 · "],
  ["Điểm A đã chọn", "Selected point A"],
  ["Chiều rộng phôi", "Stock width"],
  ["Chiều dài phôi", "Stock length"],
  ["Độ dày phôi", "Stock thickness"],
  ["Góc trái dưới", "Bottom-left corner"],
  ["Góc phải dưới", "Bottom-right corner"],
  ["Góc phải trên", "Top-right corner"],
  ["Góc trái trên", "Top-left corner"],
  ["Điểm đầu", "Start point"],
  ["Điểm cuối", "End point"],
  ["Trung điểm", "Midpoint"],
  ["Chiều rộng", "Width"],
  ["Chiều dài", "Length"],
  ["Đường chạy ", "Toolpath "],
  ["Chi tiết ", "Part "],
  ["Cung ", "Arc "],
  ["Phôi", "Stock"],
  ["Tâm", "Center"],
  ["Đo khoảng cách", "Distance measurement"],
  ["Dọc X", "Along X"],
  ["Dọc Y", "Along Y"],
  ["Dọc Z", "Along Z"],
  ["Mặt XY", "XY plane"],
];

/**
 * Translates labels generated by the geometry layer without changing their IDs.
 * The conversion is bidirectional so existing history also follows a live
 * language switch, regardless of the language active when it was recorded.
 */
export function localizeMeasurementLabel(
  label: string,
  lang: MeasurementLanguage,
): string {
  let canonicalVietnamese = label;
  for (const [vietnamese, english] of LABEL_PAIRS) {
    canonicalVietnamese = canonicalVietnamese.replaceAll(english, vietnamese);
  }
  if (lang === "VN") return canonicalVietnamese;

  let localized = canonicalVietnamese;
  for (const [vietnamese, english] of LABEL_PAIRS) {
    localized = localized.replaceAll(vietnamese, english);
  }
  return localized;
}

