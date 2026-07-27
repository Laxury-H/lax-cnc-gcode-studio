import { formatGcodeCommand } from "./diagnostics";
import type { GcodeWord } from "./types";

export type GModalGroupId =
  | "motion"
  | "plane"
  | "units"
  | "distance"
  | "arc-distance"
  | "feed-mode"
  | "coordinate-system"
  | "cutter-compensation"
  | "tool-length-compensation"
  | "path-control"
  | "retract-mode";

export type GModalGroup = {
  id: GModalGroupId;
  name: string;
  codes: readonly number[];
};

export type GModalConflict = {
  group: GModalGroup;
  words: GcodeWord[];
  codes: number[];
  commands: string[];
  message: string;
};

export const G_MODAL_GROUPS: readonly GModalGroup[] = [
  {
    id: "motion",
    name: "chuyển động",
    codes: [0, 1, 2, 3, 73, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
  },
  { id: "plane", name: "mặt phẳng", codes: [17, 18, 19] },
  { id: "units", name: "đơn vị", codes: [20, 21] },
  { id: "distance", name: "chế độ tọa độ", codes: [90, 91] },
  {
    id: "arc-distance",
    name: "chế độ tâm cung",
    codes: [90.1, 91.1],
  },
  { id: "feed-mode", name: "chế độ lượng chạy dao", codes: [93, 94] },
  {
    id: "coordinate-system",
    name: "hệ tọa độ làm việc",
    codes: [54, 55, 56, 57, 58, 59],
  },
  {
    id: "cutter-compensation",
    name: "bù bán kính dao",
    codes: [40, 41, 42],
  },
  {
    id: "tool-length-compensation",
    name: "bù chiều dài dao",
    codes: [43, 49],
  },
  { id: "path-control", name: "điều khiển quỹ đạo", codes: [61, 64] },
  { id: "retract-mode", name: "mặt phẳng rút dao", codes: [98, 99] },
] as const;

const GROUP_BY_CODE = new Map<number, GModalGroup>();
for (const group of G_MODAL_GROUPS) {
  for (const code of group.codes) GROUP_BY_CODE.set(code, group);
}

export function getGModalGroup(code: number) {
  return GROUP_BY_CODE.get(code) ?? null;
}

export function getGcodeWords(words: readonly GcodeWord[]) {
  return words.filter((word) => word.letter === "G");
}

export function findGModalConflicts(
  words: readonly GcodeWord[],
): GModalConflict[] {
  const wordsByGroup = new Map<GModalGroupId, GcodeWord[]>();

  for (const word of getGcodeWords(words)) {
    const group = getGModalGroup(word.value);
    if (!group) continue;
    const groupedWords = wordsByGroup.get(group.id) ?? [];
    groupedWords.push(word);
    wordsByGroup.set(group.id, groupedWords);
  }

  const conflicts: GModalConflict[] = [];
  for (const group of G_MODAL_GROUPS) {
    const groupedWords = wordsByGroup.get(group.id) ?? [];
    const distinctCodes = [...new Set(groupedWords.map((word) => word.value))];
    if (distinctCodes.length <= 1) continue;
    const commands = distinctCodes.map((code) =>
      formatGcodeCommand("G", code),
    );
    conflicts.push({
      group,
      words: groupedWords,
      codes: distinctCodes,
      commands,
      message: `Có nhiều lệnh cùng nhóm ${group.name} trong một block: ${commands.join(", ")}.`,
    });
  }
  return conflicts;
}

export function isMotionGCode(code: number) {
  return getGModalGroup(code)?.id === "motion";
}

export function isModalGCode(code: number) {
  return getGModalGroup(code) !== null;
}
