import type { QuoteRevision } from "./quote-view-model.ts";

const superscriptDigits: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const toSuperscript = (value: number) => String(value).split("").map((digit) => Object.entries(superscriptDigits).find(([, normal]) => normal === digit)?.[0] ?? digit).join("");

export type RevisionCoordinates = {
  mainlineVersion: number;
  branchSequence: number | null;
};

export type NextRevisionIdentity = RevisionCoordinates & {
  parentRevisionId: string;
  revisionLabel: string;
};

export function parseLegacyRevisionLabel(label: string): RevisionCoordinates {
  const normalized = label.trim();
  const match = /^V(\d+)(.*)$/i.exec(normalized);
  const mainlineVersion = Number(match?.[1] ?? 1) || 1;
  const suffix = match?.[2] ?? "";
  const normalSuffix = [...suffix].map((character) => superscriptDigits[character] ?? character).join("").replace(/\D/g, "");
  return { mainlineVersion, branchSequence: normalSuffix ? Number(normalSuffix) : null };
}

export function revisionCoordinates(revision: QuoteRevision): RevisionCoordinates {
  const legacy = parseLegacyRevisionLabel(revision.revisionLabel);
  return {
    mainlineVersion: revision.mainlineVersion ?? legacy.mainlineVersion,
    branchSequence: revision.branchSequence ?? legacy.branchSequence,
  };
}

export function formatRevisionLabel(coordinates: RevisionCoordinates): string {
  return `V${coordinates.mainlineVersion}${coordinates.branchSequence === null ? "" : toSuperscript(coordinates.branchSequence)}`;
}

export function revisionLabelParts(revision: QuoteRevision): { main: string; branch: string | null } {
  const coordinates = revisionCoordinates(revision);
  return { main: `V${coordinates.mainlineVersion}`, branch: coordinates.branchSequence === null ? null : String(coordinates.branchSequence) };
}

export function getNextRevisionLabel({ selectedRevision, allRevisions }: { selectedRevision: QuoteRevision; allRevisions: QuoteRevision[] }): NextRevisionIdentity {
  const selected = revisionCoordinates(selectedRevision);
  const coordinates = allRevisions.map(revisionCoordinates);
  const mainlineTip = Math.max(0, ...coordinates.filter((item) => item.branchSequence === null).map((item) => item.mainlineVersion));
  if (selected.branchSequence === null && selected.mainlineVersion === mainlineTip) {
    const next = { mainlineVersion: selected.mainlineVersion + 1, branchSequence: null };
    return { ...next, parentRevisionId: selectedRevision.revisionId, revisionLabel: formatRevisionLabel(next) };
  }
  const latestBranch = Math.max(1, ...coordinates.filter((item) => item.mainlineVersion === selected.mainlineVersion && item.branchSequence !== null).map((item) => item.branchSequence ?? 1));
  const next = { mainlineVersion: selected.mainlineVersion, branchSequence: latestBranch + 1 };
  return { ...next, parentRevisionId: selectedRevision.revisionId, revisionLabel: formatRevisionLabel(next) };
}
