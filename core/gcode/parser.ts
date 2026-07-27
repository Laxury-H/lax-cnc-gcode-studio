import {
  createDiagnostic,
  formatGcodeCommand,
  mergeDiagnostics,
} from "./diagnostics";
import { findGModalConflicts } from "./modal-groups";
import {
  tokenizeLine,
  type ChecksumToken,
  type GcodeToken,
  type ProgramDelimiterToken,
} from "./tokenizer";
import type {
  Diagnostic,
  GcodeWord,
  ParsedBlock,
  ParsedProgram,
} from "./types";

export type ParserOptions = {
  validateModalGroups?: boolean;
};

function executableTokensAfterChecksum(tokens: readonly GcodeToken[]) {
  const checksumIndex = tokens.findIndex((token) => token.kind === "checksum");
  if (checksumIndex < 0) return [];
  return tokens.slice(checksumIndex + 1).filter(
    (token) =>
      token.kind !== "whitespace" &&
      token.kind !== "comment",
  );
}

function parseLineNumber(
  words: readonly GcodeWord[],
  rawText: string,
  lineIndex: number,
) {
  const diagnostics: Diagnostic[] = [];
  const lineNumberWords = words.filter((word) => word.letter === "N");
  const firstLineNumber = lineNumberWords[0];

  if (lineNumberWords.length > 1) {
    diagnostics.push(
      createDiagnostic({
        lineIndex,
        severity: "error",
        code: "DUPLICATE_LINE_NUMBER",
        command: "N",
        message: `Dòng ${lineIndex + 1} có nhiều hơn một số block N.`,
        rawText,
      }),
    );
  }

  if (!firstLineNumber) {
    return { lineNumber: null, diagnostics };
  }

  if (
    !Number.isSafeInteger(firstLineNumber.value) ||
    firstLineNumber.value < 0
  ) {
    diagnostics.push(
      createDiagnostic({
        lineIndex,
        severity: "error",
        code: "INVALID_LINE_NUMBER",
        command: firstLineNumber.raw.trim().toUpperCase(),
        message: `Số block ${firstLineNumber.raw.trim()} phải là số nguyên không âm.`,
        rawText,
      }),
    );
    return { lineNumber: null, diagnostics };
  }

  const firstWord = words[0];
  if (firstWord !== firstLineNumber) {
    diagnostics.push(
      createDiagnostic({
        lineIndex,
        severity: "warning",
        code: "LINE_NUMBER_POSITION",
        command: formatGcodeCommand("N", firstLineNumber.value),
        message: `Số block N nên đứng trước các word thực thi trên dòng ${lineIndex + 1}.`,
        rawText,
      }),
    );
  }

  return { lineNumber: firstLineNumber.value, diagnostics };
}

function validateProgramDelimiter(
  words: readonly GcodeWord[],
  delimiterTokens: readonly ProgramDelimiterToken[],
  checksumTokens: readonly ChecksumToken[],
  rawText: string,
  lineIndex: number,
) {
  const diagnostics: Diagnostic[] = [];
  if (delimiterTokens.length > 1) {
    diagnostics.push(
      createDiagnostic({
        lineIndex,
        severity: "error",
        code: "DUPLICATE_PROGRAM_DELIMITER",
        command: "%",
        message: `Dòng ${lineIndex + 1} có nhiều hơn một ký tự phân cách chương trình "%".`,
        rawText,
      }),
    );
  }
  if (
    delimiterTokens.length > 0 &&
    (words.length > 0 || checksumTokens.length > 0)
  ) {
    diagnostics.push(
      createDiagnostic({
        lineIndex,
        severity: "error",
        code: "PROGRAM_DELIMITER_MIXED",
        command: "%",
        message:
          'Ký tự "%" phải nằm trên dòng riêng, ngoài comment và khoảng trắng.',
        rawText,
      }),
    );
  }
  return diagnostics;
}

export function parseBlock(
  rawText: string,
  lineIndex = 0,
  options: ParserOptions = {},
): ParsedBlock {
  const tokenized = tokenizeLine(rawText, lineIndex);
  const lineNumberResult = parseLineNumber(
    tokenized.words,
    rawText,
    lineIndex,
  );
  const delimiterTokens = tokenized.tokens.filter(
    (token): token is ProgramDelimiterToken =>
      token.kind === "program-delimiter",
  );
  const checksumTokens = tokenized.tokens.filter(
    (token): token is ChecksumToken => token.kind === "checksum",
  );
  const diagnostics: Diagnostic[] = [
    ...tokenized.diagnostics,
    ...lineNumberResult.diagnostics,
    ...validateProgramDelimiter(
      tokenized.words,
      delimiterTokens,
      checksumTokens,
      rawText,
      lineIndex,
    ),
  ];

  const trailingTokens = executableTokensAfterChecksum(tokenized.tokens);
  if (trailingTokens.length > 0) {
    diagnostics.push(
      createDiagnostic({
        lineIndex,
        severity: "error",
        code: "CHECKSUM_POSITION",
        command: "*",
        message:
          "Checksum phải là trường thực thi cuối cùng trên dòng; chỉ comment hoặc khoảng trắng được phép theo sau.",
        rawText,
      }),
    );
  }

  if (options.validateModalGroups !== false) {
    for (const conflict of findGModalConflicts(tokenized.words)) {
      diagnostics.push(
        createDiagnostic({
          lineIndex,
          severity: "error",
          code: "MODAL_CONFLICT",
          command: conflict.commands.join(" "),
          message: conflict.message,
          rawText,
          discriminator: conflict.group.id,
        }),
      );
    }
  }

  const comments = [...tokenized.comments];
  return {
    id: lineIndex,
    lineIndex,
    sourceLine: lineIndex + 1,
    rawText,
    words: [...tokenized.words],
    comments,
    comment: comments
      .map((comment) => comment.trim())
      .filter(Boolean)
      .join(" "),
    lineNumber: lineNumberResult.lineNumber,
    checksum: tokenized.checksum,
    computedChecksum: tokenized.computedChecksum,
    programDelimiter: tokenized.programDelimiter,
    diagnostics: mergeDiagnostics(diagnostics),
  };
}

export function splitProgramLines(source: string) {
  return source.split(/\r\n|\n|\r/);
}

export function parseProgram(
  source: string,
  options: ParserOptions = {},
): ParsedProgram {
  const lines = splitProgramLines(source);
  const blocks = lines.map((line, lineIndex) =>
    parseBlock(line, lineIndex, options),
  );
  return {
    source,
    lines,
    blocks,
    diagnostics: mergeDiagnostics(
      blocks.flatMap((block) => block.diagnostics),
    ),
  };
}

export const parseGcode = parseProgram;
