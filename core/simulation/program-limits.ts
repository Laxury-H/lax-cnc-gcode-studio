export const MAX_PROGRAM_BYTES = 8 * 1024 * 1024;
export const MAX_PROGRAM_LINES = 250_000;

export type ProgramLimitViolation = "size" | "lines" | null;

export function programLimitViolation(source: string): ProgramLimitViolation {
  if (source.length > MAX_PROGRAM_BYTES) return "size";
  let lines = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      lines += 1;
      if (lines > MAX_PROGRAM_LINES) return "lines";
    }
  }
  return null;
}
