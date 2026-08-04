export type Lang = "VN" | "EN";

export const translations = {
  VN: {
    // Header & Topbar
    importBtn: "Nhập tệp .NC/.TXT",
    profileLabel: "Cấu hình máy",
    routerCustom: "Máy phay 3 trục · Tùy chỉnh",
    isoBasic: "Tiêu chuẩn ISO / Fanuc",
    localProcessing: "Xử lý cục bộ",
    loadingGcode: "Đang tải tệp G-code...",
    templateLibrary: "Tải tệp mẫu từ thư viện CNC",
    uploadFile: "Tải lên tệp .nc, .txt, .gcode từ máy tính",
    projectLabel: "Dự án:",

    // View & Simulation Controls
    view2D: "Mặt phẳng phay (2D)",
    view3D: "Mô phỏng 3D (ISO)",
    desc2D: "Nhìn từ trên xuống · Kéo để di chuyển",
    desc3D: "Kéo để xoay · Shift + kéo để di chuyển vùng nhìn",
    speedLabel: "Tốc độ",
    configLabel: "Chất lượng",
    perfTitle: "Chất lượng mô phỏng dành cho máy tính Cấu hình thấp / Trung bình / Cao",
    perfLow: "⚡ Cấu hình thấp",
    perfMedium: "⚖️ Trung bình",
    perfHigh: "💎 Cấu hình cao",
    showGcode: "Hiển thị bảng G-code",
    hideGcode: "Ẩn bảng G-code",
    showDimensions: "Hiển thị kích thước",
    hideDimensions: "Ẩn kích thước",
    showGrid: "Hiển thị lưới sàn",
    hideGrid: "Ẩn lưới sàn",
    showTool: "Hiển thị dao phay",
    hideTool: "Ẩn dao phay",
    resetView: "Đặt lại góc nhìn",
    orbitHintLeft: "Chuột trái: Xoay",
    orbitHintRight: "Shift / Chuột phải: Di chuyển vùng nhìn",
    orbitHintScroll: "Con lăn chuột: Thu phóng",
    orbitHint2D: "Kéo để di chuyển bản vẽ",
    orbitHint2DScroll: "Con lăn chuột: Thu phóng",
    fitToScreen: "Thu vừa màn hình & Về gốc",
    enterFullscreen: "Phóng to toàn màn hình",
    exitFullscreen: "Thoát toàn màn hình",
    focusModeMsg: "Đã bật chế độ tập trung. Nhấn Esc để quay lại.",
    mobileSimulation: "Mô phỏng",
    mobileCode: "G-code",
    mobileAnalysis: "Phân tích",
    mobileSettings: "Thiết lập",

    // Playback & Scrubber
    rewind: "Quay lại từ đầu",
    fastForward: "Tua đến cuối",
    play: "Phát mô phỏng",
    pause: "Tạm dừng",
    stepForward: "Tiến một bước",
    progressLabel: "Tiến trình mô phỏng",
    completed: "HOÀN THÀNH",

    // Backplot Controls
    stock: "PHÔI",
    tool: "DAO PHAY",
    cuts: "ĐƯỜNG CẮT",
    rapids: "CHẠY DAO NHANH",
    comp: "BÙ DAO",
    toolpath: "ĐƯỜNG DAO",
    bounds: "ĐƯỜNG BAO",
    grid: "LƯỚI",
    reset: "ĐẶT LẠI",

    // Telemetry Dashboard
    ready: "SẴN SÀNG",
    axis: "TRỤC",
    coord: "TỌA ĐỘ",
    activeCommand: "LỆNH ĐANG THỰC THI",
    currentBlock: "DÒNG LỆNH HIỆN TẠI",
    planeBadge: "MẶT PHẲNG",
    toolPos: "Vị trí dao phay",
    currentPos: "Vị trí hiện tại (mm)",
    speedControl: "Tốc độ",

    // Metrics Strip / Statistics
    stockMetric: "Phôi",
    feedSpindle: "Bước tiến & Trục chính",
    cutDistance: "Quãng đường cắt",
    estTime: "Thời gian dự kiến",
    errorsMetric: "Lỗi",
    errorsAction: "Cần xử lý",
    errorsNone: "Không phát hiện lỗi",
    warningsMetric: "Cảnh báo",
    warningsAction: "Nhấn để kiểm tra",
    warningsNone: "An toàn",

    // G-code Sidebar Panel & Tools
    gcodeProgram: "CHƯƠNG TRÌNH G-CODE",
    editGcodeTooltip: "Chỉnh sửa hoặc dán G-code",
    noMotion: "KHÔNG CÓ CHUYỂN ĐỘNG",
    rapidMove: "G0 · CHẠY DAO NHANH",
    linearCut: "G1 · CẮT ĐƯỜNG THẲNG",
    arcCw: "G2 · CUNG TRÒN CÙNG CHIỀU KIM ĐỒNG HỒ",
    arcCcw: "G3 · CUNG TRÒN NGƯỢC CHIỀU KIM ĐỒNG HỒ",
    dwell: "G4 · DỪNG CHỜ",
    drillCycle: "CHU TRÌNH KHOAN",
    analysisDrawerTooltip: "Phân tích & Tiện ích (Kích thước, Phôi dư, Phục hồi thông minh...)",
    machineSetupTooltip: "Thiết lập phôi và máy",

    // Analysis Drawer Tabs & Content
    analysisTitle: "PHÂN TÍCH CHƯƠNG TRÌNH",
    tabErrors: "Lỗi & Cảnh báo",
    tabDimensions: "Kích thước chi tiết",
    tabRemnants: "Phôi dư có thể sử dụng (MER)",
    tabSmartResume: "Phục hồi thông minh",
    tabPostProc: "Xuất CAM (Post-Processor)",
    noErrorsTitle: "Không phát hiện lỗi",
    noErrorsDesc: "Chương trình nằm trong giới hạn phôi và các trạng thái máy đều hợp lệ.",
    partsDetected: "Đã nhận diện",
    reqClearance: "Khoảng cách an toàn yêu cầu",
    colCode: "Mã",
    colBounding: "Hộp giới hạn",
    colEdge: "Khoảng cách đến mép",
    partNote: "Đối với biên dạng có bù dao, kích thước thành phẩm sẽ trừ đi bán kính dao ở mỗi mép. Các đường bao lồng nhau bên trong được coi là lỗ/hốc và không được tính là chi tiết riêng biệt.",
    noPartsFound: "Không tìm thấy đường bao khép kín",
    remnantTitle: "Phôi dư có thể sử dụng",
    mainStockSize: "Kích thước phôi chính",
    colSize: "Kích thước (Rộng × Dài)",
    colAreaPct: "% Diện tích",
    merExplanation: "Thuật toán Hình chữ nhật rỗng lớn nhất (MER) tự động tính toán vùng phôi dư lớn nhất có thể tái sử dụng sau khi gia công.",
    noRemnantsTitle: "Không tìm thấy phôi dư đáng kể",
    noRemnantsDesc: "Tấm phôi đã được sử dụng tối ưu hoặc các chi tiết chiếm toàn bộ không gian khả dụng.",

    // Smart Resume & CAM Post-Processor
    smartResumeDesc: "Tự động tạo mã G-code để nâng trục Z an toàn và khởi động lại trục chính (M3/S) từ bất kỳ dòng lệnh nào.",
    safeZLabel: "Chiều cao an toàn trục Z (Safe Z)",
    copyRecoveryBtn: "Sao chép G-code phục hồi",
    copiedRecoveryAlert: "Đã sao chép đoạn G-code phục hồi vào khay nhớ tạm!",
    postProcTitle: "Bộ xử lý hậu kỳ CAM (Post-Processor)",
    postProcDesc: "Chuyển đổi và chuẩn hóa chương trình cho các hệ điều khiển máy phay CNC công nghiệp.",
    controllerDialect: "Hệ điều khiển mục tiêu",
    ncstudioLabel: "Weihong NcStudio V15 (Máy phay CNC 3 trục chuyên dụng)",
    syntecLabel: "Taiwan Syntec ATC (Trung tâm gia công phay có thay dao tự động)",
    camPostResult: "Kết quả G-code đã xử lý",
    camPostTitle: "Bộ xử lý hậu kỳ CAM (Post-Processor)",
    camPostDesc: "Chuyển đổi và chuẩn hóa chương trình cho các hệ điều khiển máy phay CNC công nghiệp.",
    targetControllerLabel: "Hệ điều khiển mục tiêu:",
    optNcStudio: "Weihong NcStudio V15 (Máy phay CNC 3 trục chuyên dụng)",
    optSyntec: "Taiwan Syntec ATC (Trung tâm gia công phay có thay dao tự động)",
    processedGcodeLabel: "Kết quả G-code đã xử lý:",
    copyBtn: "Sao chép",
    copiedAlert: "Đã sao chép mã G-code vào khay nhớ tạm!",
    fileTooLarge: "Tệp vượt quá 8 MB. Vui lòng chia nhỏ chương trình trước khi tải lên.",
    unsupportedFormat: "Định dạng không được hỗ trợ. Vui lòng sử dụng .NC, .TXT, .TAP, .GCODE hoặc .CNC.",
    recalculatedMsg: "Đã tính toán lại toàn bộ chương trình theo cấu hình mới.",

    // Parts drawer extra keys
    detected: "Đã nhận diện",
    requiredClearance: "Khoảng cách an toàn yêu cầu",
    colDim: "Hộp giới hạn",
    colNearest: "Khoảng cách gần nhất",
    partMethodNote: "Đối với biên dạng có bù dao, kích thước thành phẩm sẽ trừ đi bán kính dao ở mỗi mép. Các đường bao lồng nhau bên trong được coi là lỗ/hốc và không được tính là chi tiết riêng biệt.",
    noPartsTitle: "Không tìm thấy đường bao khép kín",
    noPartsDesc: "Vui lòng nhập chương trình chứa các chuỗi G1/G2/G3 khép kín để đo kích thước chi tiết.",

    // Settings modal
    machineProfile: "CẤU HÌNH MÁY",
    stockToolTitle: "Phôi, Dao phay & Vùng an toàn",
    routerNote: "`M33 S…` được hiểu là bật trục chính và `G600 T…` là lệnh chọn dao. Các lệnh `M73/M83` được xử lý như lệnh phụ trợ, không làm thay đổi hình học trừ khi thiết lập quy tắc máy cụ thể.",
    restoreDefault: "Khôi phục mặc định",
    applyRecalc: "Áp dụng & Tính toán lại",
    preferenceTitle: "ỨNG DỤNG & MÔ PHỎNG",
    preferenceDescription: "Các tùy chọn này được lưu cục bộ trên thiết bị.",
    showRapidPreference: "Hiện đường chạy nhanh G0",
    machineSoundLabel: "Âm thanh chuyển động máy",
    finishSoundLabel: "Âm báo hoàn tất",
    invalidSettingsMsg: "Cấu hình chưa hợp lệ. Kích thước, dao và tốc độ phải lớn hơn 0.",
    settingsAppliedMsg: "Đã áp dụng và lưu cấu hình workstation.",
    noToolsDetectedMsg: "Không tìm thấy thông tin dao T trong G-code hiện tại.",
    emptyFileMsg: "Tệp G-code đang trống. Chương trình hiện tại được giữ nguyên.",
    fileReadErrorMsg: "Không thể đọc tệp. Chương trình hiện tại được giữ nguyên.",
    noMotionPlaybackMsg: "Chương trình chưa có chuyển động để mô phỏng.",
    copyErrorMsg: "Không thể truy cập khay nhớ tạm. Hãy cấp quyền rồi thử lại.",
    experimentalTitle: "TÍNH NĂNG THỬ NGHIỆM",
    experimentalBadge: "BETA",
    machine3DTitle: "Mô hình máy 3D",
    machine3DDesc: "Chỉ minh họa chuyển động của máy. Chưa dùng để xác nhận va chạm, giới hạn hành trình hoặc đồ gá.",
    machine3DMetaDesc: "Minh họa chuyển động · chưa kiểm tra va chạm",
    machine3DEnabled: "Đang hiện trong thanh chế độ",
    machine3DDisabled: "Đang ẩn khỏi thanh chế độ",
    machine3DEnableMsg: "Đã bật 3D Machine thử nghiệm.",
    machine3DDisableMsg: "Đã ẩn 3D Machine khỏi thanh chế độ.",
    machine3DShortcutMsg: "3D Machine đang ẩn. Bật trong Thiết lập > Tính năng thử nghiệm.",

    // Settings field labels
    lblWidth: "Chiều dài phôi",
    lblHeight: "Chiều rộng phôi",
    lblThickness: "Chiều dày phôi",
    lblToolDia: "Đường kính dao",
    lblOriginX: "Gốc tọa độ X",
    lblOriginY: "Gốc tọa độ Y",
    lblSafeZ: "Chiều cao an toàn Z",
    lblClearance: "Khoảng cách an toàn tối thiểu",
    lblRapidFeed: "Tốc độ chạy dao nhanh (G0)",
    quickOrigin: "Ghim gốc tọa độ nhanh",
    toolLibrary: "Thư viện Dao cụ",
    toolId: "ID Dao (VD: 1, 25)",
    toolType: "Loại dao",
    toolAngle: "Góc mũi (V-bit)",
    addTool: "Thêm Dao Mới",
    autoDetectTool: "Nhận diện từ G-code",
    deleteTool: "Xóa",
    typeFlat: "Dao Phay Phẳng (Flat)",
    typeBall: "Dao Cầu (Ball Nose)",
    typeVBit: "Dao Đầu Nhọn (V-Bit)",

    // Code editor modal
    editorTitle: "TRÌNH SOẠN THẢO MÃ LỆNH",
    editorHelp1: "Không bắt buộc có khoảng trắng: N100G1X20Y30 vẫn hợp lệ.",
    editorHelp2: "Phím Space/F5: Phát · F10: Chạy từng bước · F8: Đặt lại",
    reloadSample: "Tải lại mã lệnh mẫu",
    parseSimulate: "Phân tích & Mô phỏng",

    // Drop overlay
    dropTitle: "Kéo thả tệp G-code vào đây",
    dropSub: ".NC · .TXT · .TAP · .GCODE · .CNC",

    // 3D Cube
    cubeFront: "TRƯỚC",
    cubeBack: "SAU",
    cubeLeft: "TRÁI",
    cubeRight: "PHẢI",
    cubeTop: "TRÊN",
    cubeBottom: "DƯỚI",

    // User Guide
    guideBtn: "Hướng dẫn",
    guideTitle: "Hướng dẫn Sử dụng",
    guideIntroMenu: "Tổng quan",
    guideSetupMenu: "Thiết lập",
    guideViewMenu: "Góc nhìn",
    guidePlayMenu: "Mô phỏng",
    guideToolsMenu: "Tiện ích",
    
    // Guide content - Intro
    guideIntroTitle: "Chào mừng đến với Lax CNC Studio",
    guideIntroDesc: "Phần mềm mô phỏng, phân tích và tối ưu hóa mã lệnh CNC nền web chuyên nghiệp. Dưới đây là cách khai thác sức mạnh của ứng dụng.",
    
    // Guide content - Setup
    guideSetupTitle: "Tải tệp & Thiết lập",
    guideSetupFile: "Tải tệp G-code: Bấm nút 'Nhập tệp' hoặc kéo thả file .NC, .TXT vào màn hình.",
    guideSetupProfile: "Cấu hình máy: Nhấn icon ⚙️ để chỉnh sửa kích thước phôi (X, Y, Z), dao phay, gốc tọa độ, và Safe Z.",
    
    // Guide content - View
    guideViewTitle: "Chế độ xem",
    guideView2D: "2D: Nhìn từ trên xuống. Click chuột trái kéo để di chuyển (Pan).",
    guideView3D: "3D ISO: Chế độ 3D khung lưới. Click chuột trái để xoay (Orbit), Shift + Trái để di chuyển.",
    guideViewSolid: "3D Solid: Chế độ đục phôi thực tế. Đòi hỏi cấu hình máy tốt.",
    
    // Guide content - Play
    guidePlayTitle: "Điều khiển Mô phỏng",
    guidePlayDesc: "Dùng bảng điều khiển bên dưới để Play, Pause, hoặc Step-by-step (chạy từng dòng). Bấm F10 để chạy từng bước nhanh.",
    
    // Guide content - Tools
    guideToolsTitle: "Bảng Phân tích Tiện ích",
    guideToolsErrors: "Lỗi & Cảnh báo: Tự động cảnh báo đâm dao, quá phôi, hoặc cài đặt sai.",
    guideToolsParts: "Kích thước chi tiết: Tự động gom các đường cắt thành 'Parts' và đo kích thước thành phẩm.",
    guideToolsMER: "Phôi dư (MER): Tìm phần phôi còn dư lớn nhất sau khi cắt để tận dụng.",
    guideToolsRecovery: "Phục hồi: Sinh mã G-code an toàn để chạy tiếp khi bị gãy dao hoặc mất điện.",
    guideToolsPost: "Xuất CAM: Chuyển G-code sang hệ điều khiển chuyên dụng (NcStudio, Syntec).",
  },
  EN: {
    // Header & Topbar
    importBtn: "Import File (.NC/.TXT)",
    profileLabel: "Machine Profile",
    routerCustom: "3-Axis Router · Custom",
    isoBasic: "Standard ISO / Fanuc",
    localProcessing: "Local Processing",
    loadingGcode: "Loading G-code file...",
    templateLibrary: "Load template from CNC library",
    uploadFile: "Upload .nc, .txt, .gcode from computer",
    projectLabel: "Project:",

    // View & Simulation Controls
    view2D: "2D Milling Plane",
    view3D: "3D Simulation (ISO)",
    desc2D: "Top-down view · Drag to pan",
    desc3D: "Drag to orbit · Shift + drag to pan",
    speedLabel: "Speed",
    configLabel: "Quality",
    perfTitle: "Simulation quality for Low / Medium / High-end computers",
    perfLow: "⚡ Low Spec",
    perfMedium: "⚖️ Medium Spec",
    perfHigh: "💎 High Spec",
    showGcode: "Show G-code panel",
    hideGcode: "Hide G-code panel",
    showDimensions: "Show dimensions",
    hideDimensions: "Hide dimensions",
    showGrid: "Show grid",
    hideGrid: "Hide grid",
    showTool: "Show tool",
    hideTool: "Hide tool",
    resetView: "Reset view",
    orbitHintLeft: "Left click: Orbit",
    orbitHintRight: "Shift / Right click: Pan",
    orbitHintScroll: "Scroll: Zoom",
    orbitHint2D: "Drag to pan",
    orbitHint2DScroll: "Scroll to zoom",
    fitToScreen: "Fit to screen & Origin",
    enterFullscreen: "Enter fullscreen",
    exitFullscreen: "Exit fullscreen",
    focusModeMsg: "Focus mode enabled. Press Esc to return.",
    mobileSimulation: "Simulation",
    mobileCode: "G-code",
    mobileAnalysis: "Analysis",
    mobileSettings: "Settings",

    // Playback & Scrubber
    rewind: "Rewind to start",
    fastForward: "Fast forward to end",
    play: "Play simulation",
    pause: "Pause simulation",
    stepForward: "Step forward",
    progressLabel: "Simulation progress",
    completed: "COMPLETED",

    // Backplot Controls
    stock: "STOCK",
    tool: "TOOL",
    cuts: "CUTTING PATHS",
    rapids: "RAPID MOVES",
    comp: "COMPENSATION",
    toolpath: "TOOLPATH",
    bounds: "BOUNDARIES",
    grid: "GRID",
    reset: "RESET",

    // Telemetry Dashboard
    ready: "READY",
    axis: "AXIS",
    coord: "COORDINATES",
    activeCommand: "ACTIVE COMMAND",
    currentBlock: "CURRENT BLOCK",
    planeBadge: "PLANE",
    toolPos: "Tool Position",
    currentPos: "Current Position (mm)",
    speedControl: "Speed",

    // Metrics Strip / Statistics
    stockMetric: "Stock",
    feedSpindle: "Feed & Spindle",
    cutDistance: "Cutting Distance",
    estTime: "Estimated Time",
    errorsMetric: "Errors",
    errorsAction: "Action Required",
    errorsNone: "None Detected",
    warningsMetric: "Warnings",
    warningsAction: "Click to Inspect",
    warningsNone: "Safe",

    // G-code Sidebar Panel & Tools
    gcodeProgram: "G-CODE PROGRAM",
    editGcodeTooltip: "Edit or paste G-code",
    noMotion: "NO MOTION DETECTED",
    rapidMove: "G0 · RAPID MOVE",
    linearCut: "G1 · LINEAR INTERPOLATION",
    arcCw: "G2 · CIRCULAR INTERPOLATION (CW)",
    arcCcw: "G3 · CIRCULAR INTERPOLATION (CCW)",
    dwell: "G4 · DWELL",
    drillCycle: "DRILLING CYCLE",
    analysisDrawerTooltip: "Analysis & Utilities (Dimensions, Remnants, Smart Resume...)",
    machineSetupTooltip: "Machine and Stock Setup",

    // Analysis Drawer Tabs & Content
    analysisTitle: "PROGRAM ANALYSIS",
    tabErrors: "Errors & Warnings",
    tabDimensions: "Part Dimensions",
    tabRemnants: "Usable Remnants (MER)",
    tabSmartResume: "Smart Resume",
    tabPostProc: "CAM Post-Processor",
    noErrorsTitle: "No errors detected",
    noErrorsDesc: "The program is within the stock boundaries and all machine states are valid.",
    partsDetected: "Parts Detected",
    reqClearance: "Required Clearance",
    colCode: "ID",
    colBounding: "Bounding Box",
    colEdge: "Edge Clearance",
    partNote: "For compensated contours, finished dimensions subtract the tool radius at edges. Nested inner contours are treated as pockets/holes and are not counted as separate parts.",
    noPartsFound: "No closed contours found",
    remnantTitle: "Usable Remnants",
    mainStockSize: "Main Stock Size",
    colSize: "Dimensions (W × H)",
    colAreaPct: "Area %",
    merExplanation: "The Maximal Empty Rectangle (MER) algorithm automatically calculates the largest reusable empty areas after machining.",
    noRemnantsTitle: "No significant remnants found",
    noRemnantsDesc: "The stock has been optimally utilized or the parts occupy the entire available space.",

    // Smart Resume & CAM Post-Processor
    smartResumeDesc: "Automatically generate a safe Z recovery sequence and restart the spindle (M3/S) from any selected block.",
    safeZLabel: "Safe Z Height",
    copyRecoveryBtn: "Copy Recovery G-code",
    copiedRecoveryAlert: "Recovery G-code copied to clipboard!",
    postProcTitle: "CAM Post-Processor",
    postProcDesc: "Convert and standardize the program for specialized industrial CNC controllers.",
    controllerDialect: "Target Controller Dialect",
    ncstudioLabel: "Weihong NcStudio V15 (Dedicated 3-Axis CNC Milling)",
    syntecLabel: "Taiwan Syntec ATC (Milling Machining Center with ATC)",
    camPostResult: "Processed G-code Result",
    camPostTitle: "CAM Post-Processor",
    camPostDesc: "Convert and standardize the program for specialized industrial CNC controllers.",
    targetControllerLabel: "Target Controller Dialect:",
    optNcStudio: "Weihong NcStudio V15 (Dedicated 3-Axis CNC Milling)",
    optSyntec: "Taiwan Syntec ATC (Milling Machining Center with ATC)",
    processedGcodeLabel: "Processed G-code Result:",
    copyBtn: "Copy",
    copiedAlert: "Processed G-code copied to clipboard!",
    fileTooLarge: "File exceeds 8 MB. Please split the program before importing.",
    unsupportedFormat: "Unsupported file format. Please use .NC, .TXT, .TAP, .GCODE, or .CNC.",
    recalculatedMsg: "Recalculated the entire program with the new machine profile.",

    // Parts drawer extra keys
    detected: "Parts Detected",
    requiredClearance: "Required Clearance",
    colDim: "Bounding Box",
    colNearest: "Nearest Edge",
    partMethodNote: "For compensated contours, finished dimensions subtract the tool radius at edges. Nested inner contours are treated as pockets/holes and are not counted as separate parts.",
    noPartsTitle: "No closed contours found",
    noPartsDesc: "Import a program with closed G1/G2/G3 sequences to measure part dimensions.",

    // Settings modal
    machineProfile: "MACHINE PROFILE",
    stockToolTitle: "Stock, Tool & Safe Zone",
    routerNote: "`M33 S…` is interpreted as spindle ON and `G600 T…` as tool selection. `M73/M83` are treated as auxiliary commands with no geometric effect unless specific machine rules are provided.",
    restoreDefault: "Restore Defaults",
    applyRecalc: "Apply & Recalculate",
    preferenceTitle: "APP & SIMULATION",
    preferenceDescription: "These preferences are stored locally on this device.",
    showRapidPreference: "Show rapid G0 moves",
    machineSoundLabel: "Machine movement sound",
    finishSoundLabel: "Completion sound",
    invalidSettingsMsg: "Invalid settings. Dimensions, tool size, and feed must be greater than zero.",
    settingsAppliedMsg: "Workstation settings applied and saved.",
    noToolsDetectedMsg: "No tool T information was found in the current G-code.",
    emptyFileMsg: "The G-code file is empty. The current program was kept.",
    fileReadErrorMsg: "The file could not be read. The current program was kept.",
    noMotionPlaybackMsg: "The program has no motion to simulate.",
    copyErrorMsg: "Clipboard access failed. Grant permission and try again.",
    experimentalTitle: "EXPERIMENTAL FEATURES",
    experimentalBadge: "BETA",
    machine3DTitle: "3D machine model",
    machine3DDesc: "Motion visualization only. Do not use it to validate collisions, travel limits, or fixtures.",
    machine3DMetaDesc: "Motion preview · no collision validation",
    machine3DEnabled: "Visible in the view switcher",
    machine3DDisabled: "Hidden from the view switcher",
    machine3DEnableMsg: "Experimental 3D Machine enabled.",
    machine3DDisableMsg: "3D Machine hidden from the view switcher.",
    machine3DShortcutMsg: "3D Machine is hidden. Enable it in Settings > Experimental features.",

    // Settings field labels
    lblWidth: "Stock Length (X)",
    lblHeight: "Stock Width (Y)",
    lblThickness: "Stock Thickness (Z)",
    lblToolDia: "Tool Diameter",
    lblOriginX: "Origin X",
    lblOriginY: "Origin Y",
    lblSafeZ: "Safe Z Height",
    lblClearance: "Clearance Height",
    lblRapidFeed: "Rapid Feedrate (G0)",
    quickOrigin: "Quick Origin Anchor",
    toolLibrary: "Tool Library",
    toolId: "Tool ID (e.g. 1, 25)",
    toolType: "Type",
    toolAngle: "V-Angle",
    addTool: "Add New Tool",
    autoDetectTool: "Auto-detect from G-code",
    deleteTool: "Remove",
    typeFlat: "Flat End Mill",
    typeBall: "Ball Nose",
    typeVBit: "V-Bit",

    // Code editor modal
    editorTitle: "G-CODE EDITOR",
    editorHelp1: "Spaces are optional: N100G1X20Y30 is completely valid.",
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

    // User Guide
    guideBtn: "Guide",
    guideTitle: "User Manual",
    guideIntroMenu: "Overview",
    guideSetupMenu: "Setup",
    guideViewMenu: "Viewports",
    guidePlayMenu: "Playback",
    guideToolsMenu: "Utilities",
    
    // Guide content - Intro
    guideIntroTitle: "Welcome to Lax CNC Studio",
    guideIntroDesc: "A professional web-based CNC simulation, analysis, and optimization software. Here's how to harness its power.",
    
    // Guide content - Setup
    guideSetupTitle: "Import & Setup",
    guideSetupFile: "Load G-code: Click 'Import File' or drag and drop .NC, .TXT files into the screen.",
    guideSetupProfile: "Machine Profile: Click the ⚙️ icon to edit stock size (X, Y, Z), tool dia, origin, and Safe Z.",
    
    // Guide content - View
    guideViewTitle: "Viewing Modes",
    guideView2D: "2D: Top-down view. Left click and drag to pan.",
    guideView3D: "3D ISO: Wireframe 3D. Left click to orbit, Shift + Left click to pan.",
    guideViewSolid: "Solid 3D: Realistic heightmap carving simulation. Requires decent GPU.",
    
    // Guide content - Play
    guidePlayTitle: "Playback Controls",
    guidePlayDesc: "Use the bottom scrubber to Play, Pause, or Step through code. Press F10 for quick stepping.",
    
    // Guide content - Tools
    guideToolsTitle: "Analysis & Utilities",
    guideToolsErrors: "Errors: Auto-detects tool crashes, out-of-bounds, and wrong commands.",
    guideToolsParts: "Part Dimensions: Auto-detects closed contours and calculates finished part sizes.",
    guideToolsMER: "Remnants (MER): Finds the Maximal Empty Rectangle to reuse leftover stock.",
    guideToolsRecovery: "Smart Resume: Generates safe restart G-code if tool breaks or power fails.",
    guideToolsPost: "CAM Post: Translates generic G-code for NcStudio or Syntec ATC.",
  },
} as const;

export type TranslationKey = keyof typeof translations.VN;

export function translateDiagnostic(msg: string, lang: Lang): string {
  if (lang === "VN") return msg;

  if (msg.includes("Chương trình chưa khai báo G20/G21")) return "Program is missing G20/G21 unit declaration; defaulting to millimeters.";
  if (msg.includes("Chương trình chưa khai báo G90/G91")) return "Program is missing G90/G91 distance mode; defaulting to absolute coordinates.";
  if (msg.includes("G4 cần giá trị P không âm")) return "G4 dwell requires a non-negative P value in seconds.";
  if (msg.includes("Không được lập trình trục khi G80")) return "Cannot program axis movements while G80 canned cycle cancel is active.";
  if (msg.includes("G53 chỉ hợp lệ trên cùng block với G0 hoặc G1")) return "G53 is only valid on the same block as G0 or G1.";
  if (msg.includes("G53 dùng tọa độ máy tuyệt đối")) return "G53 uses absolute machine coordinates and requires G90 mode.";
  if (msg.includes("M6 được gọi khi chưa có giá trị T")) return "M6 called without a prior T tool selection.";
  if (msg.includes("G43 cần thanh ghi H là số nguyên không âm")) return "G43 requires the H register to be a non-negative integer.";
  if (msg.includes("Chưa có chiều dài cho H")) return msg.replace("Chưa có chiều dài cho H", "Missing tool length offset for H").replace("đang dùng giá trị 0 mm.", "defaulting to 0 mm.");
  if (msg.includes("G92 cần ít nhất một giá trị trục")) return "G92 requires at least one axis value (X, Y, or Z).";
  if (msg.includes("G53 chỉ được dùng với chuyển động G0 hoặc G1")) return "G53 can only be used with G0 or G1 linear motions.";
  if (msg.includes("Tọa độ đích không hữu hạn")) return "Target coordinates are not finite; the block will not be rendered.";
  if (msg.includes("Chu trình khoan cần mặt phẳng rút dao R")) return "Drilling cycle requires a retract plane R.";
  if (msg.includes("Số lần lặp L của chu trình phải là số nguyên dương")) return "Cycle repeat count L must be a positive integer.";
  if (msg.includes("Chu trình tạo quá nhiều bước khoan")) return "Cycle generated too many peck steps; please increase the Q value.";
  if (msg.includes("Chuyển động tạo ra NaN hoặc vô cực")) return "Motion produced NaN or infinity and has been discarded.";
  if (msg.includes("Chuyển động cắt chưa có tốc độ F")) return "Cutting motion is missing a valid feed rate (F).";
  if (msg.includes("Tọa độ X/Y nằm ngoài vùng phôi")) return "X/Y coordinates exceed the declared stock boundaries.";
  if (msg.includes("G0 chạy ngang dưới Z an toàn")) return msg.replace("G0 chạy ngang dưới Z an toàn", "G0 rapid move below the safe Z clearance");
  if (msg.includes("Có chuyển động cắt khi trạng thái spindle chưa bật")) return "Cutting motion detected while the spindle is stopped.";
  
  // Arc & Geometry Errors
  if (msg.includes("Chế độ tâm cung phải là tuyệt đối hoặc tương đối")) return "Arc center mode must be either absolute or relative.";
  if (msg.includes("Giá trị I/J/K của tâm cung phải là số hữu hạn")) return "Arc center I/J/K values must be finite numbers.";
  if (msg.includes("Tọa độ tâm cung vượt giới hạn số hữu hạn")) return "Arc center coordinates exceed finite limits.";
  if (msg.includes("Bán kính cung vượt giới hạn số hữu hạn")) return "Arc radius exceeds finite limits.";
  if (msg.includes("Điểm đầu trùng với tâm nên bán kính cung bằng 0")) return "Start point coincides with the center, resulting in a radius of 0.";
  if (msg.includes("Bán kính tại điểm đầu")) return msg.replace("Bán kính tại điểm đầu", "Radius at the start point").replace("và điểm cuối", "and the end point").replace("không khớp.", "do not match.");
  if (msg.includes("Giá trị R của cung phải là số hữu hạn")) return "Arc R value must be a finite number.";
  if (msg.includes("Không thể xác định full-circle chỉ bằng R; hãy dùng I/J/K")) return "Cannot define a full circle using only R; please use I/J/K.";
  if (msg.includes("Bán kính R phải lớn hơn 0")) return "Radius R must be strictly greater than 0.";
  if (msg.includes("Độ dài dây cung vượt giới hạn số hữu hạn")) return "Chord length exceeds finite limits.";
  if (msg.includes("nhỏ hơn nửa dây cung")) return msg.replace("Bán kính R=", "Radius R=").replace("nhỏ hơn nửa dây cung", "is smaller than half the chord length");
  if (msg.includes("Không thể chọn được tâm phù hợp với hướng G2/G3 và dấu của R")) return "Cannot determine a valid center matching the G2/G3 direction and the sign of R.";
  if (msg.includes("Tâm hoặc bán kính cung không hợp lệ")) return "Invalid arc center or radius.";
  if (msg.includes("Góc quét của cung không thể xác định")) return "Arc sweep angle cannot be determined.";
  if (msg.includes("Kích thước hoặc chiều dài cung vượt giới hạn số hữu hạn")) return "Arc dimensions or length exceed finite limits.";
  if (msg.includes("Chất lượng cung cần chordError > 0")) return msg.replace("Chất lượng cung cần", "Arc resolution requires");
  if (msg.includes("Cần resolve cung thành công trước khi lấy mẫu")) return "The arc must be resolved successfully before sampling.";
  if (msg.includes("Dữ liệu cung đã resolve không hợp lệ")) return "Resolved arc data is invalid.";
  
  // Bounds & Math Errors
  if (msg.includes("Bounds phải hữu hạn và mỗi giá trị min không được lớn hơn max")) return "Bounds must be finite and minimum values cannot exceed maximum values.";
  if (msg.includes("Chiều dài đường gấp khúc vượt giới hạn số hữu hạn")) return "Polyline length exceeds finite limits.";
  if (msg.includes("Cận dưới không được lớn hơn cận trên")) return "Lower bound cannot exceed the upper bound.";
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
  if (msg.includes("đang chồng biên dạng")) return msg.replace("và", "and").replace("đang chồng biên dạng.", "have overlapping contours.");
  if (msg.includes("nhỏ hơn mức")) {
    return msg.replace("Khoảng cách", "Distance")
      .replace("chỉ", "is only")
      .replace("nhỏ hơn mức", "which is below the required clearance of")
      .replace("cách mép phôi", "from the stock edge");
  }
  if (msg.includes("cách mép phôi")) {
    return msg.replace("cách mép phôi", "from the stock edge").replace("nhỏ hơn mức", "is below the required clearance of");
  }

  return msg;
}

export type TranslationDict = Record<keyof typeof translations.VN, string>;

