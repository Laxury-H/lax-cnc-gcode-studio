export interface MiniCamValues {
  toolDia: number;
  spindleSpeed: number;
  feedRate: number;
  plungeRate: number;
  width: number;
  height: number;
  depth: number;
  stepover: number;
}

export const MAX_CAM_PASSES = 5_000;
export const MAX_CAM_OUTPUT_LINES = MAX_CAM_PASSES * 2 + 16;

type PositiveMiniCamField = Exclude<keyof MiniCamValues, "stepover">;

export type MiniCamValidation =
  | {
      code: "positive";
      field: PositiveMiniCamField;
    }
  | {
      code: "stepover-range";
      field: "stepover";
    }
  | {
      code: "pass-limit";
      maxPasses: number;
    };

export interface MiniCamValidationText {
  positive: string;
  stepoverRange: string;
  passLimit: string;
  fields: Record<keyof MiniCamValues, string>;
}

const POSITIVE_FIELDS: readonly PositiveMiniCamField[] = [
  "toolDia",
  "spindleSpeed",
  "feedRate",
  "plungeRate",
  "width",
  "height",
  "depth",
];

export function validateMiniCamValues(
  values: MiniCamValues,
): MiniCamValidation | null {
  const invalidField = POSITIVE_FIELDS.find(
    (field) => !Number.isFinite(values[field]) || values[field] <= 0,
  );
  if (invalidField) {
    return { code: "positive", field: invalidField };
  }

  if (
    !Number.isFinite(values.stepover) ||
    values.stepover < 1 ||
    values.stepover > 100
  ) {
    return { code: "stepover-range", field: "stepover" };
  }

  const step = values.toolDia * (values.stepover / 100);
  const passes = Math.ceil(values.height / step);
  if (!Number.isFinite(passes) || passes < 1 || passes > MAX_CAM_PASSES) {
    return { code: "pass-limit", maxPasses: MAX_CAM_PASSES };
  }

  return null;
}

export function formatMiniCamValidation(
  validation: MiniCamValidation | null,
  text: MiniCamValidationText,
) {
  if (!validation) return null;
  if (validation.code === "stepover-range") return text.stepoverRange;
  if (validation.code === "pass-limit") {
    return text.passLimit.replace("{max}", String(validation.maxPasses));
  }
  return text.positive.replace("{field}", text.fields[validation.field]);
}
