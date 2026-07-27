import type { Diagnostic, Severity } from "./types";

export const DIAGNOSTIC_SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

export type DiagnosticInput = {
  lineIndex: number;
  sourceLine?: number;
  severity: Severity;
  code: string;
  command?: string | null;
  message: string;
  rawText: string;
  discriminator?: string | number;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createDiagnostic(input: DiagnosticInput): Diagnostic {
  const sourceLine = input.sourceLine ?? input.lineIndex + 1;
  const command = input.command ?? null;
  const identity = [
    sourceLine,
    input.code,
    command ?? "",
    input.message,
    input.discriminator ?? "",
  ].join("|");

  return {
    id: `${input.code}-${sourceLine}-${stableHash(identity)}`,
    lineIndex: input.lineIndex,
    sourceLine,
    severity: input.severity,
    code: input.code,
    command,
    message: input.message,
    rawText: input.rawText,
  };
}

export function formatGcodeCommand(letter: string, value: number) {
  const normalized = Number.isInteger(value)
    ? value.toFixed(0)
    : value.toString();
  return `${letter.toUpperCase()}${normalized}`;
}

export function sortDiagnostics(
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      left.lineIndex - right.lineIndex ||
      DIAGNOSTIC_SEVERITY_ORDER[left.severity] -
        DIAGNOSTIC_SEVERITY_ORDER[right.severity] ||
      left.code.localeCompare(right.code) ||
      left.id.localeCompare(right.id),
  );
}

export function uniqueDiagnostics(
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    if (seen.has(diagnostic.id)) return false;
    seen.add(diagnostic.id);
    return true;
  });
}

export function mergeDiagnostics(
  ...groups: ReadonlyArray<readonly Diagnostic[]>
): Diagnostic[] {
  return sortDiagnostics(uniqueDiagnostics(groups.flat()));
}

export function hasDiagnosticErrors(diagnostics: readonly Diagnostic[]) {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
