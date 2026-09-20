// An incremental, inspectable artifact. The observer only reads these files; no model credentials reach it.
import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Endpoint } from "../shared/events.js";
import type { JourneyCase } from "./coherence-cases.js";

export const RECORDINGS = resolve(".cache/journeys");

export interface Observation {
  sequence: number;
  at: string;
  kind: "request" | "answer" | "error";
  caseId: string;
  step: number;
  data: Record<string, unknown>;
}

export interface Recording {
  version: 1;
  id: string;
  started: string;
  updated: string;
  status: "running" | "complete" | "failed" | "fixtures";
  source: "constructed" | "saved-app";
  provenance?: { url: string; capturedAt: string; sha256: string };
  endpoint: Endpoint | null;
  model: string | null;
  rubric: string;
  cases: JourneyCase[];
  questions: unknown;
  events: Observation[];
  summary?: { answered: number; matched: number; errors: number };
  error?: string;
}

export async function recordJourney(input: Pick<Recording, "endpoint" | "model" | "cases" | "questions"> & Partial<Pick<Recording, "source" | "provenance">>, directory = RECORDINGS) {
  const now = new Date().toISOString();
  const recording: Recording = {
    version: 1, id: `${now.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
    started: now, updated: now, status: "running", source: "constructed", rubric: "transition-v1",
    ...input, events: [],
  };
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, `${recording.id}.json`);
  const save = async () => {
    recording.updated = new Date().toISOString();
    await writeFile(`${file}.tmp`, JSON.stringify(recording, null, 2));
    await rename(`${file}.tmp`, file);
  };
  await save();
  return {
    recording, file,
    async event(kind: Observation["kind"], caseId: string, step: number, data: Observation["data"]) {
      recording.events.push({ sequence: recording.events.length + 1, at: new Date().toISOString(), kind, caseId, step, data });
      await save();
    },
    async finish(status: Recording["status"], summary?: Recording["summary"], error?: string) {
      Object.assign(recording, { status, summary, error });
      await save();
    },
  };
}
