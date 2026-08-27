import { useId, useMemo, useState } from "react";
import type { TranslationDict } from "../../app/i18n";
import { Icon } from "./ui/Icon";
import { ResponsiveDialog } from "./ui/ResponsiveDialog";
import {
  MAX_CAM_OUTPUT_LINES,
  MAX_CAM_PASSES,
  type MiniCamValues,
  formatMiniCamValidation,
  validateMiniCamValues,
} from "./mini-cam-validation";
import styles from "./ui/ResponsiveDialog.module.css";

export type MiniCamTab = "facing" | "pocket" | "tabs" | "pcd";

interface MiniCamModalProps {
  t: TranslationDict;
  onClose: () => void;
  onGenerate: (gcode: string) => void;
}

export function MiniCamModal({ t, onClose, onGenerate }: MiniCamModalProps) {
  const [activeTab, setActiveTab] = useState<MiniCamTab>("facing");
  const [toolDia, setToolDia] = useState(6);
  const [spindleSpeed, setSpindleSpeed] = useState(18000);
  const [feedRate, setFeedRate] = useState(2000);
  const [plungeRate, setPlungeRate] = useState(800);
  const [width, setWidth] = useState(200);
  const [height, setHeight] = useState(200);
  const [depth, setDepth] = useState(1);
  const [stepover, setStepover] = useState(40);
  const [stepdown, setStepdown] = useState(2);
  const [tabCount, setTabCount] = useState(4);
  const [tabWidth, setTabWidth] = useState(5);
  const [tabHeight, setTabHeight] = useState(2);
  const [pcdDia, setPcdDia] = useState(100);
  const [holeCount, setHoleCount] = useState(6);
  const [startAngle, setStartAngle] = useState(0);

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
  const validationError = formatMiniCamValidation(validation, {
    positive: t.miniCamValidationPositive,
    stepoverRange: t.miniCamValidationStepover,
    passLimit: t.miniCamValidationPassLimit,
    fields: {
      toolDia: t.miniCamToolDiameter,
      spindleSpeed: t.miniCamSpindleSpeed,
      feedRate: t.miniCamFeedRate,
      plungeRate: t.miniCamPlungeRate,
      width: t.miniCamWidth,
      height: t.miniCamHeight,
      depth: t.miniCamDepth,
      stepover: t.miniCamStepover,
    },
  });

  const handleGenerate = () => {
    if (validationError) return;

    const lines: string[] = [
      `(MINI CAM - ${activeTab.toUpperCase()})`,
      "G90 G21 G17",
      "G54",
      `M3 S${spindleSpeed}`,
      "G0 Z10.000",
    ];

    if (activeTab === "facing") {
      const step = toolDia * (stepover / 100);
      const passes = Math.min(MAX_CAM_PASSES, Math.ceil(height / step));
      const actualStep = height / Math.max(1, passes);
      lines.push(
        "G0 X0.000 Y0.000",
        `G1 Z-${depth.toFixed(3)} F${plungeRate}`,
      );

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
    } else if (activeTab === "pocket") {
      // Multi-depth rectangular pocket
      const stepZ = Math.max(0.2, stepdown);
      const totalPassesZ = Math.ceil(depth / stepZ);
      const stepXY = toolDia * (stepover / 100);

      lines.push("G0 X0.000 Y0.000");

      for (let passZ = 1; passZ <= totalPassesZ; passZ++) {
        const curZ = Math.min(depth, passZ * stepZ);
        lines.push(`G1 Z-${curZ.toFixed(3)} F${plungeRate}`);

        const passesY = Math.ceil(height / stepXY);
        const actualStepY = height / Math.max(1, passesY);
        let y = 0;
        let goRight = true;

        for (let idx = 0; idx <= passesY; idx++) {
          if (lines.length >= MAX_CAM_OUTPUT_LINES - 5) break;
          const x = goRight ? width : 0;
          lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}`);
          if (idx < passesY) {
            y += actualStepY;
            lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}`);
            goRight = !goRight;
          }
        }
        lines.push("G0 Z2.000", "G0 X0.000 Y0.000");
      }
    } else if (activeTab === "tabs") {
      // Profile Cutout with Holding Tabs
      const stepZ = Math.max(0.2, stepdown);
      const totalPassesZ = Math.ceil(depth / stepZ);
      const tabH = Math.min(depth - 0.2, tabHeight);
      const tabW = Math.max(2, tabWidth);

      for (let passZ = 1; passZ <= totalPassesZ; passZ++) {
        const isFinalPass = passZ === totalPassesZ;
        const curZ = Math.min(depth, passZ * stepZ);
        const tabZ = isFinalPass ? -(depth - tabH) : -curZ;

        lines.push(
          "G0 X0.000 Y0.000",
          `G1 Z-${curZ.toFixed(3)} F${plungeRate}`,
        );

        if (!isFinalPass || tabCount <= 0) {
          // Normal box contour
          lines.push(
            `G1 X${width.toFixed(3)} Y0.000 F${feedRate}`,
            `G1 X${width.toFixed(3)} Y${height.toFixed(3)} F${feedRate}`,
            `G1 X0.000 Y${height.toFixed(3)} F${feedRate}`,
            `G1 X0.000 Y0.000 F${feedRate}`,
          );
        } else {
          // Bottom edge with tab in middle
          const midX = width / 2;
          lines.push(
            `G1 X${(midX - tabW / 2).toFixed(3)} Y0.000 F${feedRate}`,
            `G1 Z${tabZ.toFixed(3)} F${feedRate}`,
            `G1 X${(midX + tabW / 2).toFixed(3)} Y0.000 F${feedRate}`,
            `G1 Z-${curZ.toFixed(3)} F${plungeRate}`,
            `G1 X${width.toFixed(3)} Y0.000 F${feedRate}`,
          );
          // Right edge with tab in middle
          const midY = height / 2;
          lines.push(
            `G1 X${width.toFixed(3)} Y${(midY - tabW / 2).toFixed(3)} F${feedRate}`,
            `G1 Z${tabZ.toFixed(3)} F${feedRate}`,
            `G1 X${width.toFixed(3)} Y${(midY + tabW / 2).toFixed(3)} F${feedRate}`,
            `G1 Z-${curZ.toFixed(3)} F${plungeRate}`,
            `G1 X${width.toFixed(3)} Y${height.toFixed(3)} F${feedRate}`,
          );
          // Top edge with tab in middle
          lines.push(
            `G1 X${(midX + tabW / 2).toFixed(3)} Y${height.toFixed(3)} F${feedRate}`,
            `G1 Z${tabZ.toFixed(3)} F${feedRate}`,
            `G1 X${(midX - tabW / 2).toFixed(3)} Y${height.toFixed(3)} F${feedRate}`,
            `G1 Z-${curZ.toFixed(3)} F${plungeRate}`,
            `G1 X0.000 Y${height.toFixed(3)} F${feedRate}`,
          );
          // Left edge with tab in middle
          lines.push(
            `G1 X0.000 Y${(midY + tabW / 2).toFixed(3)} F${feedRate}`,
            `G1 Z${tabZ.toFixed(3)} F${feedRate}`,
            `G1 X0.000 Y${(midY - tabW / 2).toFixed(3)} F${feedRate}`,
            `G1 Z-${curZ.toFixed(3)} F${plungeRate}`,
            `G1 X0.000 Y0.000 F${feedRate}`,
          );
        }
        lines.push("G0 Z5.000");
      }
    } else if (activeTab === "pcd") {
      // Pitch Circle Diameter Bolt Holes
      const radius = pcdDia / 2;
      const centerX = width / 2;
      const centerY = height / 2;
      const count = Math.max(1, Math.round(holeCount));

      lines.push(`G80 (CANCEL MODAL CYCLES)`);

      for (let i = 0; i < count; i++) {
        const angDeg = startAngle + i * (360 / count);
        const angRad = (angDeg * Math.PI) / 180;
        const x = centerX + radius * Math.cos(angRad);
        const y = centerY + radius * Math.sin(angRad);

        lines.push(
          `G0 X${x.toFixed(3)} Y${y.toFixed(3)}`,
          `G81 X${x.toFixed(3)} Y${y.toFixed(3)} Z-${depth.toFixed(3)} R2.000 F${plungeRate}`,
        );
      }
      lines.push("G80");
    }

    lines.push("G0 Z10.000", "M5", "M30");
    onGenerate(lines.slice(0, MAX_CAM_OUTPUT_LINES).join("\n"));
  };

  const invalid = Boolean(validation);
  const inputAccessibility = (field: keyof MiniCamValues) => {
    const fieldInvalid = Boolean(
      validation &&
        validation.code !== "pass-limit" &&
        validation.field === field,
    );
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
          {t.miniCamTitle}
        </h2>
        <button
          className={styles.closeButton}
          type="button"
          onClick={onClose}
          data-dialog-autofocus
          aria-label={t.miniCamClose}
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
            {t.miniCamTabFacing}
          </button>
          <button
            className={`${styles.tabButton}${activeTab === "pocket" ? ` ${styles.activeTab}` : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "pocket"}
            onClick={() => setActiveTab("pocket")}
          >
            {t.miniCamTabPocket}
          </button>
          <button
            className={`${styles.tabButton}${activeTab === "tabs" ? ` ${styles.activeTab}` : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "tabs"}
            onClick={() => setActiveTab("tabs")}
          >
            {t.miniCamTabTabs}
          </button>
          <button
            className={`${styles.tabButton}${activeTab === "pcd" ? ` ${styles.activeTab}` : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "pcd"}
            onClick={() => setActiveTab("pcd")}
          >
            {t.miniCamTabPcd}
          </button>
        </div>

        <div className={styles.miniDivider} aria-hidden="true" />

        <div className={styles.miniForm} role="tabpanel">
          <h3 className={styles.sectionTitle}>{t.miniCamToolSection}</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              {t.miniCamToolDiameter}
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
              {t.miniCamSpindleSpeed}
              <input
                type="number"
                min="1"
                value={spindleSpeed}
                onChange={(event) => setSpindleSpeed(Number(event.target.value))}
                {...inputAccessibility("spindleSpeed")}
              />
            </label>
            <label className={styles.field}>
              {t.miniCamFeedRate}
              <input
                type="number"
                min="0.001"
                value={feedRate}
                onChange={(event) => setFeedRate(Number(event.target.value))}
                {...inputAccessibility("feedRate")}
              />
            </label>
            <label className={styles.field}>
              {t.miniCamPlungeRate}
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
            {t.miniCamWorkSection}
          </h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              {t.miniCamWidth}
              <input
                type="number"
                min="0.001"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
                {...inputAccessibility("width")}
              />
            </label>
            <label className={styles.field}>
              {t.miniCamHeight}
              <input
                type="number"
                min="0.001"
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
                {...inputAccessibility("height")}
              />
            </label>
            <label className={styles.field}>
              {t.miniCamDepth}
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
              {t.miniCamStepover}
              <input
                type="number"
                min="1"
                max="100"
                value={stepover}
                onChange={(event) => setStepover(Number(event.target.value))}
                {...inputAccessibility("stepover")}
              />
            </label>

            {activeTab === "pocket" && (
              <label className={styles.field}>
                {t.miniCamStepdown}
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={stepdown}
                  onChange={(e) => setStepdown(Number(e.target.value))}
                />
              </label>
            )}

            {activeTab === "tabs" && (
              <>
                <label className={styles.field}>
                  {t.miniCamTabCount}
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={tabCount}
                    onChange={(e) => setTabCount(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  {t.miniCamTabWidth}
                  <input
                    type="number"
                    min="1"
                    value={tabWidth}
                    onChange={(e) => setTabWidth(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  {t.miniCamTabHeight}
                  <input
                    type="number"
                    min="0.5"
                    value={tabHeight}
                    onChange={(e) => setTabHeight(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  {t.miniCamStepdown}
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={stepdown}
                    onChange={(e) => setStepdown(Number(e.target.value))}
                  />
                </label>
              </>
            )}

            {activeTab === "pcd" && (
              <>
                <label className={styles.field}>
                  {t.miniCamPcdDia}
                  <input
                    type="number"
                    min="1"
                    value={pcdDia}
                    onChange={(e) => setPcdDia(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  {t.miniCamHoleCount}
                  <input
                    type="number"
                    min="1"
                    value={holeCount}
                    onChange={(e) => setHoleCount(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  {t.miniCamStartAngle}
                  <input
                    type="number"
                    value={startAngle}
                    onChange={(e) => setStartAngle(Number(e.target.value))}
                  />
                </label>
              </>
            )}
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
          {t.miniCamCancel}
        </button>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={handleGenerate}
          disabled={invalid}
        >
          {t.miniCamGenerate}
        </button>
      </footer>
    </ResponsiveDialog>
  );
}
