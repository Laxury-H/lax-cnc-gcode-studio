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
    safeZLabel: "Độ cao an toàn Z (Safe Z)",
    copyRecoveryBtn: "Sao chép G-code phục hồi",
    copiedRecoveryAlert: "Đã sao chép đoạn G-code phục hồi vào Clipboard!",
    postProcTitle: "Bộ xử lý hậu kỳ (CAM Post-Processor)",
    postProcDesc: "Chuyển đổi và chuẩn hóa chương trình sang hệ điều khiển máy phay gỗ CNC chuyên dụng",
    controllerDialect: "Hệ điều khiển đích (Controller Dialect)",
    ncstudioLabel: "Weihong NcStudio V15 (Phay CNC 3 trục chuyên dụng)",
    syntecLabel: "Taiwan Syntec ATC (Trung tâm gia công phay có thay dao tự động)",
    camPostResult: "Kết quả G-code đã xử lý (CAM Post)",
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

    // Parts drawer extra keys
    detected: "Đã nhận diện",
    requiredClearance: "Khoảng cách yêu cầu",
    colDim: "Kích thước bao",
    colNearest: "Gần nhất",
    partMethodNote: "Với biên dạng bo góc có bù dao, kích thước thành phẩm được trừ bán kính dao ở mỗi mép. Biên dạng lồng bên trong được xem là lỗ/rãnh và không tính thành tấm riêng.",
    noPartsTitle: "Chưa tìm thấy đường bao kín",
    noPartsDesc: "Hãy nhập chương trình có chuỗi G1/G2/G3 khép kín để đo chi tiết.",

    // Settings modal
    machineProfile: "HỒ SƠ MÁY",
    stockToolTitle: "Phôi, dao và vùng an toàn",
    routerNote: "`M33 S…` được hiểu là bật spindle và `G600 T…` là chọn dao. `M73/M83` được giữ như lệnh phụ trợ, không làm thay đổi hình học cho đến khi bạn cung cấp quy tắc máy chính xác.",
    restoreDefault: "Khôi phục mặc định",
    applyRecalc: "Áp dụng & tính lại",

    // Settings field labels
    lblWidth: "Dài phôi",
    lblHeight: "Rộng phôi",
    lblThickness: "Dày phôi",
    lblToolDia: "Đường kính dao",
    lblOriginX: "Gốc phôi X",
    lblOriginY: "Gốc phôi Y",
    lblSafeZ: "Z an toàn",
    lblClearance: "Khoảng cách tối thiểu",
    lblRapidFeed: "Tốc độ G0",

    // Code editor modal
    editorTitle: "TRÌNH SOẠN THẢO",
    editorHelp1: "Không cần dấu cách: N100G1X20Y30 vẫn đọc được.",
    editorHelp2: "Space/F5: Play · F10: Step · F8: Reset",
    reloadSample: "Nạp lại code mẫu",
    parseSimulate: "Dịch & mô phỏng",

    // Drop overlay
    dropTitle: "Thả file G-code vào đây",
    dropSub: ".NC · .TXT · .TAP · .GCODE · .CNC",

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
    safeZLabel: "Safe Z clearance height",
    copyRecoveryBtn: "Copy recovery G-code",
    copiedRecoveryAlert: "Recovery G-code copied to clipboard!",
    postProcTitle: "CAM Post-Processor",
    postProcDesc: "Convert and standardize program for specialized industrial CNC controllers",
    controllerDialect: "Target Controller Dialect",
    ncstudioLabel: "Weihong NcStudio V15 (Dedicated 3-Axis CNC Milling)",
    syntecLabel: "Taiwan Syntec ATC (Milling Machining Center with ATC)",
    camPostResult: "Processed G-code result (CAM Post)",
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

    // Parts drawer extra keys
    detected: "Detected",
    requiredClearance: "Req. clearance",
    colDim: "Bounding box",
    colNearest: "Nearest gap",
    partMethodNote: "For compensated contours, finished dimensions subtract tool radius at edges. Nested inner contours are treated as pockets/holes and not counted as separate parts.",
    noPartsTitle: "No closed contours found",
    noPartsDesc: "Import a program with closed G1/G2/G3 sequences to measure parts.",

    // Settings modal
    machineProfile: "MACHINE PROFILE",
    stockToolTitle: "Stock, Tool & Safe Zone",
    routerNote: "`M33 S…` is interpreted as spindle on and `G600 T…` as tool select. `M73/M83` are treated as auxiliary commands with no geometry change until precise machine rules are provided.",
    restoreDefault: "Restore Defaults",
    applyRecalc: "Apply & Recalculate",

    // Settings field labels
    lblWidth: "Stock Length",
    lblHeight: "Stock Width",
    lblThickness: "Stock Thickness",
    lblToolDia: "Tool Diameter",
    lblOriginX: "Origin X",
    lblOriginY: "Origin Y",
    lblSafeZ: "Safe Z",
    lblClearance: "Min. Clearance",
    lblRapidFeed: "G0 Rapid Speed",

    // Code editor modal
    editorTitle: "CODE EDITOR",
    editorHelp1: "No spaces needed: N100G1X20Y30 is valid.",
    editorHelp2: "Space/F5: Play · F10: Step · F8: Reset",
    reloadSample: "Reload Sample Code",
    parseSimulate: "Parse & Simulate",

    // Drop overlay
    dropTitle: "Drop G-code file here",
    dropSub: ".NC · .TXT · .TAP · .GCODE · .CNC",

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
  if (msg.includes("G0 chạy ngang dưới Z an toàn")) return msg.replace("G0 chạy ngang dưới Z an toàn", "G0 rapid move below safe Z clearance");
  if (msg.includes("Có chuyển động cắt khi trạng thái spindle chưa bật")) return "Cutting motion detected while spindle is stopped.";
  
  // Arc & Geometry Errors
  if (msg.includes("Chế độ tâm cung phải là tuyệt đối hoặc tương đối")) return "Arc center mode must be absolute or relative.";
  if (msg.includes("Giá trị I/J/K của tâm cung phải là số hữu hạn")) return "Arc center I/J/K values must be finite numbers.";
  if (msg.includes("Tọa độ tâm cung vượt giới hạn số hữu hạn")) return "Arc center coordinates exceed finite limits.";
  if (msg.includes("Bán kính cung vượt giới hạn số hữu hạn")) return "Arc radius exceeds finite limits.";
  if (msg.includes("Điểm đầu trùng với tâm nên bán kính cung bằng 0")) return "Start point coincides with center, resulting in 0 radius.";
  if (msg.includes("Bán kính tại điểm đầu")) return msg.replace("Bán kính tại điểm đầu", "Radius at start point").replace("và điểm cuối", "and end point").replace("không khớp.", "do not match.");
  if (msg.includes("Giá trị R của cung phải là số hữu hạn")) return "Arc R value must be a finite number.";
  if (msg.includes("Không thể xác định full-circle chỉ bằng R; hãy dùng I/J/K")) return "Cannot define full-circle using only R; use I/J/K.";
  if (msg.includes("Bán kính R phải lớn hơn 0")) return "Radius R must be greater than 0.";
  if (msg.includes("Độ dài dây cung vượt giới hạn số hữu hạn")) return "Chord length exceeds finite limits.";
  if (msg.includes("nhỏ hơn nửa dây cung")) return msg.replace("Bán kính R=", "Radius R=").replace("nhỏ hơn nửa dây cung", "is smaller than half chord length");
  if (msg.includes("Không thể chọn được tâm phù hợp với hướng G2/G3 và dấu của R")) return "Cannot determine valid center matching G2/G3 direction and sign of R.";
  if (msg.includes("Tâm hoặc bán kính cung không hợp lệ")) return "Invalid arc center or radius.";
  if (msg.includes("Góc quét của cung không thể xác định")) return "Arc sweep angle cannot be determined.";
  if (msg.includes("Kích thước hoặc chiều dài cung vượt giới hạn số hữu hạn")) return "Arc dimensions or length exceed finite limits.";
  if (msg.includes("Chất lượng cung cần chordError > 0")) return msg.replace("Chất lượng cung cần", "Arc resolution requires");
  if (msg.includes("Cần resolve cung thành công trước khi lấy mẫu")) return "Must resolve arc before sampling.";
  if (msg.includes("Dữ liệu cung đã resolve không hợp lệ")) return "Resolved arc data is invalid.";
  
  // Bounds & Math Errors
  if (msg.includes("Bounds phải hữu hạn và mỗi giá trị min không được lớn hơn max")) return "Bounds must be finite and min values cannot exceed max values.";
  if (msg.includes("Chiều dài đường gấp khúc vượt giới hạn số hữu hạn")) return "Polyline length exceeds finite limits.";
  if (msg.includes("Cận dưới không được lớn hơn cận trên")) return "Lower bound cannot exceed upper bound.";
  if (msg.includes("vượt giới hạn số hữu hạn")) {
    return msg.replace("vượt giới hạn số hữu hạn", "exceeds finite limits")
      .replace("Khoảng cách", "Distance")
      .replace("Tổng hai vector", "Sum of vectors")
      .replace("Hiệu hai vector", "Difference of vectors")
      .replace("Hệ số", "Factor")
      .replace("Vector sau khi nhân", "Scaled vector")
      .replace("Điểm đầu", "Start point")
      .replace("Điểm cuối", "End point")
      .replace("Tỷ lệ nội suy", "Interpolation ratio")
      .replace("Điểm nội suy", "Interpolated point")
      .replace("Điểm thứ", "Point #");
  }
  if (msg.includes("phải là một số hữu hạn")) {
    return msg.replace("phải là một số hữu hạn.", "must be a finite number.")
      .replace("Giá trị", "Value")
      .replace("Cận dưới", "Lower bound")
      .replace("Cận trên", "Upper bound");
  }
  if (msg.includes("phải có tọa độ X, Y, Z hữu hạn")) {
    return msg.replace("Điểm", "Point").replace("phải có tọa độ X, Y, Z hữu hạn.", "must have finite X, Y, Z coordinates.");
  }
  
  // Contour / Part / Clearances
  if (msg.includes("đang chồng biên dạng")) return msg.replace("và", "and").replace("đang chồng biên dạng.", "are overlapping in contour.");
  if (msg.includes("nhỏ hơn mức")) {
    return msg.replace("Khoảng cách", "Distance")
      .replace("chỉ", "is only")
      .replace("nhỏ hơn mức", "below required clearance")
      .replace("cách mép phôi", "is from stock edge");
  }
  if (msg.includes("cách mép phôi")) {
    return msg.replace("cách mép phôi", "from stock edge").replace("nhỏ hơn mức", "below required clearance");
  }

  return msg;
}

export type TranslationDict = Record<keyof typeof translations.VN, string>;
