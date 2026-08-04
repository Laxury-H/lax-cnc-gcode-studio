import { useId, useMemo, useState } from "react";
import type { TranslationDict } from "../../app/i18n";
import { Icon } from "./ui/Icon";
import { ResponsiveDialog } from "./ui/ResponsiveDialog";
import styles from "./ui/ResponsiveDialog.module.css";

interface MiniCamModalProps {
  t: TranslationDict;
  onClose: () => void;
  onGenerate: (gcode: string) => void;
}

interface MiniCamValues {
  toolDia: number;
  spindleSpeed: number;
  feedRate: number;
  plungeRate: number;
  width: number;
  height: number;
  depth: number;
  stepover: number;
}

const MAX_CAM_PASSES = 5_000;
const MAX_CAM_OUTPUT_LINES = MAX_CAM_PASSES * 2 + 16;

function validateMiniCamValues(values: MiniCamValues) {
  const positiveFields: Array<[number, keyof MiniCamValues, string]> = [
    [values.toolDia, "toolDia", "Đường kính dao / Tool diameter"],
    [values.spindleSpeed, "spindleSpeed", "Tốc độ trục chính / Spindle speed"],
    [values.feedRate, "feedRate", "Bước tiến / Feed rate"],
    [values.plungeRate, "plungeRate", "Bước tiến xuống dao / Plunge rate"],
    [values.width, "width", "Chiều rộng / Width"],
    [values.height, "height", "Chiều dài / Height"],
    [values.depth, "depth", "Chiều sâu / Depth"],
  ];

  const invalidField = positiveFields.find(
    ([value]) => !Number.isFinite(value) || value <= 0,
  );
  if (invalidField) {
    return {
      field: invalidField[1],
      message: `${invalidField[2]} phải là số hữu hạn lớn hơn 0.`,
    };
  }

  if (
    !Number.isFinite(values.stepover) ||
    values.stepover < 1 ||
    values.stepover > 100
  ) {
    return {
      field: "stepover" as const,
      message: "Stepover phải nằm trong khoảng 1–100%.",
    };
  }

  const step = values.toolDia * (values.stepover / 100);
  const passes = Math.ceil(values.height / step);
  if (!Number.isFinite(passes) || passes < 1 || passes > MAX_CAM_PASSES) {
    return {
      message: `Số lượt chạy vượt giới hạn an toàn ${MAX_CAM_PASSES.toLocaleString()} passes. Tăng đường kính dao hoặc stepover.`,
    };
  }

  return null;
}

export function MiniCamModal({ onClose, onGenerate }: MiniCamModalProps) {
  const [activeTab, setActiveTab] = useState<"facing" | "pocket">("facing");
  const [toolDia, setToolDia] = useState(6);
  const [spindleSpeed, setSpindleSpeed] = useState(18000);
  const [feedRate, setFeedRate] = useState(2000);
  const [plungeRate, setPlungeRate] = useState(800);
  const [width, setWidth] = useState(200);
  const [height, setHeight] = useState(200);
  const [depth, setDepth] = useState(1);
  const [stepover, setStepover] = useState(40);
  const titleId = useId();
  const errorId = useId();

  const values = useMemo<MiniCamValues>(
    () => ({
      toolDia,
      spindleSpeed,
      feedRate,
      plungeRate,
      width,
      height,
      depth,
      stepover,
    }),
    [depth, feedRate, height, plungeRate, spindleSpeed, stepover, toolDia, width],
  );
  const validation = useMemo(() => validateMiniCamValues(values), [values]);
  const validationError = validation?.message ?? null;

  const handleGenerate = () => {
    if (validationError || activeTab !== "facing") return;

    const step = toolDia * (stepover / 100);
    const passes = Math.min(MAX_CAM_PASSES, Math.ceil(height / step));
    const actualStep = height / passes;
    const lines = [
      `(MINI CAM - ${activeTab.toUpperCase()})`,
      "G90 G21 G17",
      "G54",
      `M3 S${spindleSpeed}`,
      "G0 Z10.000",
      "G0 X0.000 Y0.000",
      `G1 Z-${depth.toFixed(3)} F${plungeRate}`,
    ];

    let y = 0;
    let goRight = true;
    for (let index = 0; index <= passes; index += 1) {
      if (lines.length >= MAX_CAM_OUTPUT_LINES - 3) break;

      const x = goRight ? width : 0;
      lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}`);
      if (index < passes && lines.length < MAX_CAM_OUTPUT_LINES - 3) {
        y += actualStep;
        lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}`);
        goRight = !goRight;
      }
    }

    lines.push("G0 Z10.000", "M5", "M30");
    onGenerate(lines.slice(0, MAX_CAM_OUTPUT_LINES).join("\n"));
  };

  const invalid = Boolean(validation);
  const inputAccessibility = (field: keyof MiniCamValues) => {
    const fieldInvalid = validation?.field === field;
    return {
      "aria-invalid": fieldInvalid,
      "aria-describedby": fieldInvalid ? errorId : undefined,
    } as const;
  };

  return (
    <ResponsiveDialog
      onClose={onClose}
      titleId={titleId}
      descriptionId={validationError ? errorId : undefined}
      size="medium"
      height="auto"
    >
      <header className={styles.header}>
        <h2
          className={`${styles.heading} ${styles.headingWithIcon}`}
          id={titleId}
        >
          <Icon
            name="layer"
            size={20}
            fallback="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
          CNC-Calc (Mini CAM)
        </h2>
        <button
          className={styles.closeButton}
          type="button"
          onClick={onClose}
          data-dialog-autofocus
          aria-label="Đóng Mini CAM / Close Mini CAM"
        >
          <Icon name="x" size={24} fallback="M6 18L18 6M6 6l12 12" />
        </button>
      </header>

      <div className={styles.miniBody}>
        <div className={`${styles.miniTabs} ${styles.guideTabs}`} role="tablist">
          <button
            className={`${styles.tabButton}${activeTab === "facing" ? ` ${styles.activeTab}` : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "facing"}
            onClick={() => setActiveTab("facing")}
          >
            Phay mặt (Facing)
          </button>
          <button
            className={styles.tabButton}
            type="button"
            role="tab"
            aria-selected="false"
            disabled
          >
            Phay hốc (TBD)
          </button>
        </div>

        <div className={styles.miniDivider} aria-hidden="true" />

        <div className={styles.miniForm} role="tabpanel">
          <h3 className={styles.sectionTitle}>Thông số Dao (Tool)</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Đường kính dao (mm)
              <input
                type="number"
                min="0.001"
                step="0.1"
                value={toolDia}
                onChange={(event) => setToolDia(Number(event.target.value))}
                {...inputAccessibility("toolDia")}
              />
            </label>
            <label className={styles.field}>
              Tốc độ trục chính (RPM)
              <input
                type="number"
                min="1"
                value={spindleSpeed}
                onChange={(event) => setSpindleSpeed(Number(event.target.value))}
                {...inputAccessibility("spindleSpeed")}
              />
            </label>
            <label className={styles.field}>
              Bước tiến (Feed - mm/min)
              <input
                type="number"
                min="0.001"
                value={feedRate}
                onChange={(event) => setFeedRate(Number(event.target.value))}
                {...inputAccessibility("feedRate")}
              />
            </label>
            <label className={styles.field}>
              Bước tiến xuống dao (Plunge - mm/min)
              <input
                type="number"
                min="0.001"
                value={plungeRate}
                onChange={(event) => setPlungeRate(Number(event.target.value))}
                {...inputAccessibility("plungeRate")}
              />
            </label>
          </div>

          <h3 className={`${styles.sectionTitle} ${styles.sectionTitleSpaced}`}>
            Kích thước gia công (Facing)
          </h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Chiều rộng (X - mm)
              <input
                type="number"
                min="0.001"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
                {...inputAccessibility("width")}
              />
            </label>
            <label className={styles.field}>
              Chiều dài (Y - mm)
              <input
                type="number"
                min="0.001"
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
                {...inputAccessibility("height")}
              />
            </label>
            <label className={styles.field}>
              Chiều sâu cắt (Z - mm)
              <input
                type="number"
                min="0.001"
                step="0.1"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
                {...inputAccessibility("depth")}
              />
            </label>
            <label className={styles.field}>
              Độ dịch dao (Stepover %)
              <input
                type="number"
                min="1"
                max="100"
                value={stepover}
                onChange={(event) => setStepover(Number(event.target.value))}
                {...inputAccessibility("stepover")}
              />
            </label>
          </div>

          {validationError && (
            <p className={styles.validationError} id={errorId} role="alert">
              {validationError}
            </p>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <button className={styles.secondaryButton} type="button" onClick={onClose}>
          Hủy
        </button>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={handleGenerate}
          disabled={invalid || activeTab !== "facing"}
        >
          Sinh G-Code
        </button>
      </footer>
    </ResponsiveDialog>
  );
}
