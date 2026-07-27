import { createDiagnostic, sortDiagnostics } from "./diagnostics";
import type { Diagnostic, GcodeWord } from "./types";

type TokenBase = {
  raw: string;
  column: number;
  endColumn: number;
};

export type WordToken = TokenBase & {
  kind: "word";
  word: GcodeWord;
};

export type WhitespaceToken = TokenBase & {
  kind: "whitespace";
};

export type CommentToken = TokenBase & {
  kind: "comment";
  style: "parentheses" | "semicolon";
  text: string;
  closed: boolean;
};

export type ProgramDelimiterToken = TokenBase & {
  kind: "program-delimiter";
};

export type ChecksumToken = TokenBase & {
  kind: "checksum";
  value: number | null;
  computed: number;
  valid: boolean;
};

export type InvalidToken = TokenBase & {
  kind: "invalid";
  reason: "missing-number" | "invalid-character" | "number-out-of-range";
};

export type GcodeToken =
  | WordToken
  | WhitespaceToken
  | CommentToken
  | ProgramDelimiterToken
  | ChecksumToken
  | InvalidToken;

export type TokenizedLine = {
  lineIndex: number;
  sourceLine: number;
  rawText: string;
  tokens: GcodeToken[];
  words: GcodeWord[];
  comments: string[];
  programDelimiter: boolean;
  checksum: number | null;
  computedChecksum: number | null;
  diagnostics: Diagnostic[];
};

type ScannedNumber = {
  raw: string;
  value: number;
  end: number;
};

function isAsciiLetter(character: string | undefined) {
  if (!character) return false;
  const code = character.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isDigit(character: string | undefined) {
  if (!character) return false;
  const code = character.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isHorizontalWhitespace(character: string | undefined) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\v" ||
    character === "\f"
  );
}

function scanNumber(
  source: string,
  start: number,
  integerOnly = false,
): ScannedNumber | null {
  let cursor = start;
  if (source[cursor] === "+" || source[cursor] === "-") cursor += 1;

  let digitCount = 0;
  while (isDigit(source[cursor])) {
    cursor += 1;
    digitCount += 1;
  }

  if (!integerOnly && source[cursor] === ".") {
    cursor += 1;
    while (isDigit(source[cursor])) {
      cursor += 1;
      digitCount += 1;
    }
  }

  if (digitCount === 0) return null;
  const raw = source.slice(start, cursor);
  return { raw, value: Number(raw), end: cursor };
}

function attemptedNumberEnd(source: string, start: number) {
  let cursor = start;
  if (source[cursor] === "+" || source[cursor] === "-") cursor += 1;
  if (source[cursor] === ".") cursor += 1;
  while (isDigit(source[cursor])) cursor += 1;
  return cursor;
}

function toSpan(raw: string, start: number): TokenBase {
  return {
    raw,
    column: start + 1,
    endColumn: start + Math.max(1, raw.length),
  };
}

function beginsRecognizedToken(character: string | undefined) {
  return (
    isAsciiLetter(character) ||
    isHorizontalWhitespace(character) ||
    character === "(" ||
    character === ";" ||
    character === "*" ||
    character === "%"
  );
}

export function computeXorChecksum(source: string) {
  let checksum = 0;
  for (let index = 0; index < source.length; index += 1) {
    checksum ^= source.charCodeAt(index) & 0xff;
  }
  return checksum;
}

export function tokenizeLine(
  rawText: string,
  lineIndex = 0,
): TokenizedLine {
  const sourceLine = lineIndex + 1;
  const tokens: GcodeToken[] = [];
  const diagnostics: Diagnostic[] = [];
  let cursor = 0;
  let checksum: number | null = null;
  let computedChecksum: number | null = null;
  let checksumCount = 0;

  const report = (
    severity: "error" | "warning" | "info",
    code: string,
    message: string,
    column: number,
    command: string | null = null,
  ) => {
    diagnostics.push(
      createDiagnostic({
        lineIndex,
        sourceLine,
        severity,
        code,
        command,
        message,
        rawText,
        discriminator: column,
      }),
    );
  };

  while (cursor < rawText.length) {
    const character = rawText[cursor];

    if (isHorizontalWhitespace(character)) {
      const start = cursor;
      while (isHorizontalWhitespace(rawText[cursor])) cursor += 1;
      const raw = rawText.slice(start, cursor);
      tokens.push({ kind: "whitespace", ...toSpan(raw, start) });
      continue;
    }

    if (character === "(") {
      const start = cursor;
      let depth = 1;
      cursor += 1;
      while (cursor < rawText.length && depth > 0) {
        if (rawText[cursor] === "(") depth += 1;
        else if (rawText[cursor] === ")") depth -= 1;
        cursor += 1;
      }
      const closed = depth === 0;
      const raw = rawText.slice(start, cursor);
      const text = closed ? raw.slice(1, -1) : raw.slice(1);
      tokens.push({
        kind: "comment",
        style: "parentheses",
        text,
        closed,
        ...toSpan(raw, start),
      });
      if (!closed) {
        report(
          "error",
          "UNCLOSED_COMMENT",
          `Comment mở tại cột ${start + 1} chưa có dấu ")" kết thúc.`,
          start + 1,
        );
      }
      continue;
    }

    if (character === ";") {
      const start = cursor;
      cursor = rawText.length;
      const raw = rawText.slice(start);
      tokens.push({
        kind: "comment",
        style: "semicolon",
        text: raw.slice(1),
        closed: true,
        ...toSpan(raw, start),
      });
      continue;
    }

    if (character === "%") {
      const start = cursor;
      cursor += 1;
      tokens.push({
        kind: "program-delimiter",
        ...toSpan(rawText.slice(start, cursor), start),
      });
      continue;
    }

    if (character === "*") {
      const start = cursor;
      checksumCount += 1;
      cursor += 1;
      while (isHorizontalWhitespace(rawText[cursor])) cursor += 1;
      const numberStart = cursor;
      const scanned = scanNumber(rawText, numberStart, true);
      const computed = computeXorChecksum(rawText.slice(0, start));
      if (computedChecksum === null) computedChecksum = computed;

      if (!scanned) {
        const end = attemptedNumberEnd(rawText, numberStart);
        cursor = Math.max(cursor, end);
        const raw = rawText.slice(start, cursor);
        tokens.push({
          kind: "checksum",
          value: null,
          computed,
          valid: false,
          ...toSpan(raw, start),
        });
        report(
          "error",
          "CHECKSUM_MISSING_NUMBER",
          `Dấu "*" tại cột ${start + 1} phải theo sau bởi một checksum số nguyên.`,
          start + 1,
          "*",
        );
        continue;
      }

      cursor = scanned.end;
      let invalidInteger = false;
      if (rawText[cursor] === ".") {
        invalidInteger = true;
        cursor += 1;
        while (isDigit(rawText[cursor])) cursor += 1;
      }

      const value = invalidInteger ? null : scanned.value;
      const inRange =
        value !== null &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= 255;
      const valid = inRange && value === computed && checksumCount === 1;
      const raw = rawText.slice(start, cursor);
      tokens.push({
        kind: "checksum",
        value,
        computed,
        valid,
        ...toSpan(raw, start),
      });

      if (checksumCount > 1) {
        report(
          "error",
          "DUPLICATE_CHECKSUM",
          `Dòng ${sourceLine} có nhiều hơn một trường checksum "*".`,
          start + 1,
          "*",
        );
      } else if (invalidInteger) {
        report(
          "error",
          "CHECKSUM_NOT_INTEGER",
          `Checksum tại cột ${start + 1} phải là số nguyên.`,
          start + 1,
          "*",
        );
      } else if (!inRange) {
        report(
          "error",
          "CHECKSUM_OUT_OF_RANGE",
          `Checksum tại cột ${start + 1} phải nằm trong khoảng 0 đến 255.`,
          start + 1,
          "*",
        );
      } else if (value !== computed) {
        report(
          "error",
          "CHECKSUM_MISMATCH",
          `Checksum không khớp: nhận ${value}, giá trị XOR tính được là ${computed}.`,
          start + 1,
          "*",
        );
      }

      if (checksum === null && value !== null) checksum = value;
      continue;
    }

    if (isAsciiLetter(character)) {
      const start = cursor;
      const letter = character.toUpperCase();
      cursor += 1;
      while (isHorizontalWhitespace(rawText[cursor])) cursor += 1;
      const numberStart = cursor;
      const scanned = scanNumber(rawText, numberStart);

      if (!scanned) {
        cursor = Math.max(cursor, attemptedNumberEnd(rawText, numberStart));
        const raw = rawText.slice(start, cursor);
        tokens.push({
          kind: "invalid",
          reason: "missing-number",
          ...toSpan(raw, start),
        });
        report(
          "error",
          "WORD_MISSING_NUMBER",
          `Từ "${letter}" tại cột ${start + 1} thiếu giá trị số.`,
          start + 1,
          letter,
        );
        continue;
      }

      cursor = scanned.end;
      const raw = rawText.slice(start, cursor);
      if (!Number.isFinite(scanned.value)) {
        tokens.push({
          kind: "invalid",
          reason: "number-out-of-range",
          ...toSpan(raw, start),
        });
        report(
          "error",
          "NUMBER_OUT_OF_RANGE",
          `Giá trị của ${letter} tại cột ${start + 1} vượt phạm vi số hữu hạn.`,
          start + 1,
          letter,
        );
        continue;
      }

      const word: GcodeWord = {
        letter,
        value: scanned.value,
        raw,
        column: start + 1,
        endColumn: start + raw.length,
      };
      tokens.push({ kind: "word", word, ...toSpan(raw, start) });
      continue;
    }

    const start = cursor;
    cursor += 1;
    while (
      cursor < rawText.length &&
      !beginsRecognizedToken(rawText[cursor])
    ) {
      cursor += 1;
    }
    const raw = rawText.slice(start, cursor);
    tokens.push({
      kind: "invalid",
      reason: "invalid-character",
      ...toSpan(raw, start),
    });
    report(
      "error",
      "INVALID_TOKEN",
      `Token "${raw}" tại cột ${start + 1} không hợp lệ.`,
      start + 1,
    );
  }

  const reconstructed = tokens.map((token) => token.raw).join("");
  if (reconstructed !== rawText) {
    report(
      "error",
      "TOKENIZER_INTERNAL_ERROR",
      "Tokenizer không thể giữ nguyên đầy đủ nội dung dòng G-code.",
      1,
    );
  }

  return {
    lineIndex,
    sourceLine,
    rawText,
    tokens,
    words: tokens
      .filter((token): token is WordToken => token.kind === "word")
      .map((token) => token.word),
    comments: tokens
      .filter((token): token is CommentToken => token.kind === "comment")
      .map((token) => token.text),
    programDelimiter: tokens.some(
      (token) => token.kind === "program-delimiter",
    ),
    checksum,
    computedChecksum,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

export const tokenizeGcodeLine = tokenizeLine;
