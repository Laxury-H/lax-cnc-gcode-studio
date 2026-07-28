export type Lang = "VN" | "EN";

export const translations = {
  VN: {
    // Header & Topbar
    importBtn: "Import .NC/.TXT",
    profileLabel: "Hồ sơ máy",
    routerCustom: "Router 3 trục · Custom",
    isoBasic: "ISO / Fanuc cơ bản",
    localProcessing: "Xử lý cục bộ",
    loadingGcode: "Đang nạp tập tin G-code...",
    templateLibrary: "Tải file mẫu từ thư viện CNC",
    uploadFile: "Tải tập tin .nc, .txt, .gcode từ máy tính",
    projectLabel: "Dự án:",

    // View & Simulation Controls
    view2D: "Mặt phẳng phay",
    view3D: "Mô phỏng 3D (ISO)",
    desc2D: "Nhìn từ trên xuống · Kéo để di chuyển",
    desc3D: "Kéo để xoay · Shift+kéo để pan",
    speedLabel: "Tốc độ",
    configLabel: "Cấu hình",
    perfTitle: "Chế độ hiệu năng mô phỏng cho máy Yếu / Trung bình / Cao",
    perfLow: "⚡ Máy Yếu",
    perfMedium: "⚖️ Trung bình",
    perfHigh: "💎 Máy Cao",
    showGcode: "Hiện bảng G-code",
    hideGcode: "Ẩn bảng G-code",
    showDimensions: "Hiện đo kích thước",
    hideDimensions: "Ẩn đo kích thước",
    showGrid: "Hiện lưới sàn",
    hideGrid: "Ẩn lưới sàn",
    showTool: "Hiện dao phay",
    hideTool: "Ẩn dao phay",
    resetView: "Đặt lại",
    orbitHintLeft: "Chuột trái: xoay",
    orbitHintRight: "Shift/chuột phải: pan",
    orbitHintScroll: "Con lăn: zoom",
    orbitHint2D: "Kéo để di chuyển bản vẽ",
    orbitHint2DScroll: "Con lăn để thu phóng",
    fitToScreen: "Về gốc và vừa khung",
    enterFullscreen: "Toàn màn hình mô phỏng",
    exitFullscreen: "Thoát toàn màn hình",
    focusModeMsg: "Đã mở chế độ tập trung. Nhấn Esc để quay lại.",

    // Playback & Scrubber
    rewind: "Về đầu",
    fastForward: "Đến cuối",
    play: "Phát mô phỏng",
    pause: "Tạm dừng",
    stepForward: "Bước tiếp",
    progressLabel: "Tiến độ mô phỏng",
    completed: "ĐÃ CHẠY",

    // Backplot Controls
    stock: "PHÔI",
    tool: "DAO",
    cuts: "ĐƯỜNG CẮT",
    rapids: "ĐƯỜNG KHÔNG",
    comp: "BÙ DAO",
    bounds: "KHUNG",
    grid: "LƯỚI",
    reset: "ĐẶT LẠI",

    // Telemetry Dashboard
    ready: "SẴN SÀNG",
    axis: "TRỤC",
    coord: "TỌA ĐỘ",
    activeCommand: "MÃ LỆNH ĐANG CHẠY",
    currentBlock: "LỆNH HIỆN TẠI",
    planeBadge: "MẶT PHAY",
    toolPos: "Vị trí dao",
    currentPos: "Vị trí hiện tại (mm)",
    speedControl: "Tốc độ",

    // Metrics Strip / Statistics
    stockMetric: "Phôi",
    feedSpindle: "F & S",
    cutDistance: "Quãng cắt",
    estTime: "Thời gian gia công",
    errorsMetric: "Lỗi",
    errorsAction: "Cần xử lý",
    errorsNone: "Không phát hiện",
    warningsMetric: "Cảnh báo",
    warningsAction: "Nhấn để kiểm tra",
    warningsNone: "An toàn",

    // G-code Sidebar Panel & Tools
    gcodeProgram: "CHƯƠNG TRÌNH G-CODE",
    editGcodeTooltip: "Sửa hoặc dán G-code",
    noMotion: "CHƯƠNG TRÌNH TRỐNG",
    rapidMove: "G0 · CHẠY NHANH",
    linearCut: "G1 · CẮT TUYẾN TÍNH",
    arcCw: "G2 · CUNG TRÒN CW",
    arcCcw: "G3 · CUNG TRÒN CCW",
    dwell: "G4 · TẠM DỪNG",
    drillCycle: "CHU TRÌNH KHOAN",
    analysisDrawerTooltip: "Phân tích & Tiện ích (Kích thước, Phôi dư, Smart Resume...)",
    machineSetupTooltip: "Thiết lập phôi và máy",

    // Analysis Drawer Tabs & Content
    analysisTitle: "PHÂN TÍCH CHƯƠNG TRÌNH",
    tabErrors: "Lỗi & cảnh báo",
    tabDimensions: "Kích thước chi tiết",
    tabRemnants: "Phôi dư khả dụng (MER)",
    tabSmartResume: "Smart Resume",
    tabPostProc: "Xuất CAM (Post)",
    noErrorsTitle: "Không phát hiện lỗi",
    noErrorsDesc: "Chương trình nằm trong giới hạn phôi và các trạng thái chính đã hợp lệ.",
    partsDetected: "Đã nhận diện",
    reqClearance: "Khoảng cách yêu cầu",
    colCode: "Mã",
    colBounding: "Kích thước bao",
    colEdge: "Mép phôi",
    partNote: "Với biên dạng bo góc có bù dao, kích thước thành phẩm được trừ bán kính dao ở mỗi mép. Biên dạng lồng bên trong được xem là lỗ/rãnh và không tính thành tấm riêng.",
    noPartsFound: "Chưa tìm thấy đường bao kín",
    remnantTitle: "Phôi dư khả dụng",
    mainStockSize: "Kích thước phôi chính",
    colSize: "Kích thước (R × D)",
    colAreaPct: "Tỷ lệ diện tích",
    merExplanation: "Thuật toán Maximal Empty Rectangle (MER) tự động tính toán vùng phôi dư lớn nhất có thể tận dụng lại sau khi gia công các chi tiết trên tấm.",
    noRemnantsTitle: "Không có phôi dư đáng kể",
    noRemnantsDesc: "Tấm phôi đã được tận dụng tối đa hoặc các chi tiết chiếm trọn không gian khả dụng.",

    // Smart Resume & CAM Post-Processor
    smartResumeDesc: "Tự động sinh lệnh khôi phục trục Z an toàn và mở lại trục chính (M3/S) từ lệnh bất kỳ",
    safeZLabel: "Độ cao an toàn Z (Safe Z):",
    copyRecoveryBtn: "Sao chép G-code phục hồi",
    copiedRecoveryAlert: "Đã sao chép đoạn G-code phục hồi vào Clipboard!",
    camPostTitle: "Bộ xử lý hậu kỳ (CAM Post-Processor)",
    camPostDesc: "Chuyển đổi và chuẩn hóa chương trình sang hệ điều khiển máy phay gỗ CNC chuyên dụng",
    targetControllerLabel: "Hệ điều khiển đích (Controller Dialect):",
    optNcStudio: "Weihong NcStudio V15 (Phay CNC 3 trục chuyên dụng)",
    optSyntec: "Taiwan Syntec ATC (Trung tâm gia công phay có thay dao tự động)",
    processedGcodeLabel: "Kết quả G-code đã xử lý (CAM Post):",
    copyBtn: "Sao chép",
    copiedAlert: "Đã sao chép G-code đã xuất vào Clipboard!",
    fileTooLarge: "File lớn hơn 8 MB. Hãy chia chương trình trước khi nhập.",
    unsupportedFormat: "Định dạng chưa hỗ trợ. Dùng .NC, .TXT, .TAP, .GCODE hoặc .CNC.",
    recalculatedMsg: "Đã tính lại toàn bộ chương trình theo cấu hình mới.",

    // 3D Cube
    cubeFront: "TRƯỚC",
    cubeBack: "SAU",
    cubeLeft: "TRÁI",
    cubeRight: "PHẢI",
    cubeTop: "ĐỈNH",
    cubeBottom: "ĐÁY",
  },
  EN: {
    // Header & Topbar
    importBtn: "Import .NC/.TXT",
    profileLabel: "Machine Profile",
    routerCustom: "3-Axis Router · Custom",
    isoBasic: "Basic ISO / Fanuc",
    localProcessing: "Local Processing",
    loadingGcode: "Loading G-code file...",
    templateLibrary: "Load template from CNC library",
    uploadFile: "Upload .nc, .txt, .gcode from PC",
    projectLabel: "Project:",

    // View & Simulation Controls
    view2D: "Milling Plane",
    view3D: "3D Simulation (ISO)",
    desc2D: "Top-down view · Drag to pan",
    desc3D: "Drag to orbit · Shift+drag to pan",
    speedLabel: "Speed",
    configLabel: "Quality",
    perfTitle: "Simulation performance quality for Low / Medium / High specs",
    perfLow: "⚡ Low Spec",
    perfMedium: "⚖️ Medium",
    perfHigh: "💎 High Quality",
    showGcode: "Show G-code panel",
    hideGcode: "Hide G-code panel",
    showDimensions: "Show dimensions",
    hideDimensions: "Hide dimensions",
    showGrid: "Show grid",
    hideGrid: "Hide grid",
    showTool: "Show tool",
    hideTool: "Hide tool",
    resetView: "Reset View",
    orbitHintLeft: "Left click: orbit",
    orbitHintRight: "Shift/Right click: pan",
    orbitHintScroll: "Scroll: zoom",
    orbitHint2D: "Drag to pan drawing",
    orbitHint2DScroll: "Scroll to zoom",
    fitToScreen: "Fit to screen & Origin",
    enterFullscreen: "Enter Fullscreen",
    exitFullscreen: "Exit Fullscreen",
    focusModeMsg: "Focus mode enabled. Press Esc to return.",

    // Playback & Scrubber
    rewind: "Rewind",
    fastForward: "Fast Forward",
    play: "Play simulation",
    pause: "Pause",
    stepForward: "Step forward",
    progressLabel: "Simulation progress",
    completed: "COMPLETED",

    // Backplot Controls
    stock: "STOCK",
    tool: "TOOL",
    cuts: "CUTS",
    rapids: "RAPIDS",
    comp: "COMP",
    bounds: "BOUNDS",
    grid: "GRID",
    reset: "RESET",

    // Telemetry Dashboard
    ready: "READY",
    axis: "AXIS",
    coord: "COORD",
    activeCommand: "ACTIVE COMMAND",
    currentBlock: "CURRENT BLOCK",
    planeBadge: "PLANE",
    toolPos: "Tool position",
    currentPos: "Current position (mm)",
    speedControl: "Speed",

    // Metrics Strip / Statistics
    stockMetric: "Stock",
    feedSpindle: "F & S",
    cutDistance: "Cut Dist.",
    estTime: "Est. Time",
    errorsMetric: "Errors",
    errorsAction: "Action req.",
    errorsNone: "None detected",
    warningsMetric: "Warnings",
    warningsAction: "Click to inspect",
    warningsNone: "Safe",

    // G-code Sidebar Panel & Tools
    gcodeProgram: "G-CODE PROGRAM",
    editGcodeTooltip: "Edit or paste G-code",
    noMotion: "NO MOTION",
    rapidMove: "G0 · RAPID MOVE",
    linearCut: "G1 · LINEAR CUT",
    arcCw: "G2 · ARC CW",
    arcCcw: "G3 · ARC CCW",
    dwell: "G4 · DWELL",
    drillCycle: "DRILLING CYCLE",
    analysisDrawerTooltip: "Analysis & Tools (Dimensions, Remnants, Smart Resume...)",
    machineSetupTooltip: "Stock and Machine Setup",

    // Analysis Drawer Tabs & Content
    analysisTitle: "PROGRAM ANALYSIS",
    tabErrors: "Errors & Warnings",
    tabDimensions: "Part Dimensions",
    tabRemnants: "Usable Remnants (MER)",
    tabSmartResume: "Smart Resume",
    tabPostProc: "CAM Export (Post)",
    noErrorsTitle: "No errors detected",
    noErrorsDesc: "Program is within stock boundaries and machine states are valid.",
    partsDetected: "Detected",
    reqClearance: "Req. clearance",
    colCode: "ID",
    colBounding: "Bounding box",
    colEdge: "Edge gap",
    partNote: "For compensated contours, finished dimensions subtract tool radius at edges. Nested inner contours are treated as pockets/holes and not counted as separate parts.",
    noPartsFound: "No closed contours found",
    remnantTitle: "Usable remnants",
    mainStockSize: "Main stock size",
    colSize: "Size (W × H)",
    colAreaPct: "Area %",
    merExplanation: "The Maximal Empty Rectangle (MER) algorithm automatically computes the largest reusable empty areas after machining.",
    noRemnantsTitle: "No significant remnants found",
    noRemnantsDesc: "Stock has been optimally utilized or parts occupy the entire available space.",

    // Smart Resume & CAM Post-Processor
    smartResumeDesc: "Automatically generate safe Z recovery and spindle start (M3/S) from any block",
    safeZLabel: "Safe Z clearance height:",
    copyRecoveryBtn: "Copy recovery G-code",
    copiedRecoveryAlert: "Recovery G-code copied to clipboard!",
    camPostTitle: "CAM Post-Processor",
    camPostDesc: "Convert and standardize program for specialized industrial CNC controllers",
    targetControllerLabel: "Target Controller Dialect:",
    optNcStudio: "Weihong NcStudio V15 (Dedicated 3-Axis CNC Milling)",
    optSyntec: "Taiwan Syntec ATC (Milling Machining Center with ATC)",
    processedGcodeLabel: "Processed G-code result (CAM Post):",
    copyBtn: "Copy",
    copiedAlert: "Exported G-code copied to clipboard!",
    fileTooLarge: "File exceeds 8 MB. Please split the program before importing.",
    unsupportedFormat: "Unsupported format. Use .NC, .TXT, .TAP, .GCODE or .CNC.",
    recalculatedMsg: "Recalculated entire program with new profile.",

    // 3D Cube
    cubeFront: "FRONT",
    cubeBack: "BACK",
    cubeLeft: "LEFT",
    cubeRight: "RIGHT",
    cubeTop: "TOP",
    cubeBottom: "BOTTOM",
  },
} as const;

export type TranslationKey = keyof typeof translations.VN;

export function translateDiagnostic(msg: string, lang: Lang): string {
  if (lang === "VN") return msg;

  if (msg.includes("Chương trình chưa khai báo G20/G21")) return "Program missing G20/G21 units; defaulting to millimeters.";
  if (msg.includes("Chương trình chưa khai báo G90/G91")) return "Program missing G90/G91 distance mode; defaulting to absolute.";
  if (msg.includes("G4 cần giá trị P không âm")) return "G4 dwell requires a non-negative P value in seconds.";
  if (msg.includes("Không được lập trình trục khi G80")) return "Cannot program axis moves while G80 canned cycle cancel is active.";
  if (msg.includes("G53 chỉ hợp lệ trên cùng block với G0 hoặc G1")) return "G53 is only valid on the same block with G0 or G1.";
  if (msg.includes("G53 dùng tọa độ máy tuyệt đối")) return "G53 uses absolute machine coordinates and requires G90.";
  if (msg.includes("M6 được gọi khi chưa có giá trị T")) return "M6 called without prior T tool selection.";
  if (msg.includes("G43 cần thanh ghi H là số nguyên không âm")) return "G43 requires H register to be a non-negative integer.";
  if (msg.includes("Chưa có chiều dài cho H")) return msg.replace("Chưa có chiều dài cho H", "Missing tool length offset for H").replace("đang dùng giá trị 0 mm.", "defaulting to 0 mm.");
  if (msg.includes("G92 cần ít nhất một giá trị trục")) return "G92 requires at least one X, Y, or Z axis value.";
  if (msg.includes("G53 chỉ được dùng với chuyển động G0 hoặc G1")) return "G53 can only be used with G0 or G1 linear motion.";
  if (msg.includes("Tọa độ đích không hữu hạn")) return "Target coordinates are not finite; block not rendered.";
  if (msg.includes("Chu trình khoan cần mặt phẳng rút dao R")) return "Drilling cycle requires retract plane R.";
  if (msg.includes("Số lần lặp L của chu trình phải là số nguyên dương")) return "Cycle repeat count L must be a positive integer.";
  if (msg.includes("Chu trình tạo quá nhiều bước khoan")) return "Cycle generated too many peck steps; please increase Q.";
  if (msg.includes("Chuyển động tạo ra NaN hoặc vô cực")) return "Motion produced NaN or infinity and was discarded.";
  if (msg.includes("Chuyển động cắt chưa có tốc độ F")) return "Cutting motion missing valid feed rate F.";
  if (msg.includes("Tọa độ X/Y nằm ngoài vùng phôi")) return "X/Y coordinates exceed declared stock boundaries.";
  if (msg.includes("Có chuyển động cắt khi trạng thái spindle chưa bật")) return "Cutting motion detected while spindle is stopped.";
  if (msg.includes("đang chồng biên dạng")) return msg.replace("và", "and").replace("đang chồng biên dạng.", "are overlapping.");
  if (msg.includes("chỉ")) return msg.replace("chỉ", "only").replace("nhỏ hơn mức", "less than clearance");

  return msg;
}

export type TranslationDict = Record<keyof typeof translations.VN, string>;
