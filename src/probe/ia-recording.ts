import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { RECORDINGS } from "./journey-recording.js";
import type { AppMap, Finding, Resolution, Seed } from "../server/ia/graph.js";
import type { Endpoint } from "../shared/events.js";
import type { Place } from "./coherence-cases.js";
import type { Candidate, Assembly } from "../server/ia/decisions.js";

import type { LinkDecision } from "../server/ia/whole.js";

import type { MapIssue } from "../server/ia/consequences.js";

import type { JourneyReview, ProposalReview } from "../server/ia/proposal.js";

export interface Revision {
  proposal?: { state: "draft" | "review" | "revision"; journeys: JourneyReview[]; excluded: string[]; receipts: string[]; reviewFindings: Finding[]; coverage?: ProposalReview["coverage"] };
  issues?: MapIssue[];
  links?: LinkDecision[];
  number: number; label?: string; map: AppMap; changes: string[]; structural: Finding[];
  critique?: { answers: Record<string, any>; questions: unknown; findings: Finding[]; ms: number };
  assembly?: Pick<Assembly, "aliases" | "pending" | "decisions">;
}
export interface ReplayStep {
  scenario: string; from: string; action: { kind: string; label: string }; resolution: Resolution;
  observedMock?: string; choice: string; expected: string; pass: boolean;
  materialization?: string;
}
export interface IARecording {
  version: 3; id: string; started: string; updated: string; status: "running" | "stable" | "resolved" | "needs_review" | "failed";
  experiment?: "whole-app"; connectionStrategy?: "independent-links"; refinementStrategy?: "task-consequences" | "construct-and-critique";
  proposalSummary?: { resolved: boolean; reviewed: boolean; remainingReviewFindings: Finding[]; excludedTasks: string[] }; wallMs?: number;
  vocabulary?: "responsibilities-v1" | "responsibilities-v2" | "responsibilities-v3" | "responsibilities-v4";
  sample?: { index: number; variant: string; suiteId: string; seedMode: "prompt-plan" };
  phase: string; endpoint: Endpoint; model: string;
  source: "closed-ia"; provenance: { url: string; capturedAt: string; sha256: string };
  seed: Seed; candidates: Candidate[]; firstMock: Place; bindings: Record<string, string>;
  calls: { decisions: number; generation: number; navigation: number; ms: number; inputTokens: number };
  revisions: Revision[]; replay: ReplayStep[];
  events: Array<{ sequence: number; at: string; stage: string; kind: "request" | "answer" | "error" | "stop"; data: unknown }>;
  summary?: { revisions: number; destinations: number; actions: number; unresolved: number; replayPassed: number; replayTotal: number; stopReason: string };
  error?: string;
}
export async function recordIA(input: Pick<IARecording, "endpoint" | "model" | "provenance" | "seed" | "candidates" | "firstMock">, directory = RECORDINGS) {
  const now = new Date().toISOString();
  const run: IARecording = { ...input, version: 3, id: `${now.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`, started: now, updated: now, source: "closed-ia", phase: "Constructing candidates", status: "running", bindings: { first: input.firstMock.id }, calls: { decisions: 0, generation: 0, navigation: 0, ms: 0, inputTokens: 0 }, revisions: [], replay: [], events: [] };
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, `${run.id}.json`);
  const save = async () => { run.updated = new Date().toISOString(); await writeFile(`${file}.tmp`, JSON.stringify(run, null, 2)); await rename(`${file}.tmp`, file); };
  await save();
  return { run, file, save, async event(stage: string, kind: IARecording["events"][number]["kind"], data: unknown) {
    run.events.push({ sequence: run.events.length + 1, at: new Date().toISOString(), stage, kind, data }); await save();
  } };
}
