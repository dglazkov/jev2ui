import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { appendFileSync, statSync } from "node:fs";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { TypeSafeClient, noul, type Questions } from "@typesafe-ai/sdk";
import { parse as parsePartial } from "partial-json";
import type { Decision, Endpoint } from "../shared/events.js";

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
export const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest";
/** Writes code, not words, and only when a screen needs something the kit cannot draw (mock/bake.ts). */
export const BAKER_MODEL = process.env.BAKER_MODEL ?? "gemini-3.8-flash";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (expected in .env)`);
  return value;
}

// System One is answered by one of two services that speak the same wire format: jev, TypeSafe's own, and gev
// (github.com/dglazkov/gev), ours. The person says which (a setting in the browser, a header on every request), and
// whatever a request sets going is answered by that one alone: a screen is not half of each. Nothing falls back:
// an endpoint that does not answer says so.
const ENDPOINTS: Record<Endpoint, { key: string; baseURL?: string }> = {
  jev: { key: "JEV_API_KEY" },
  gev: { key: "GEV_API_KEY", baseURL: process.env.GEV_BASE_URL ?? "https://gev-huio5ftumq-uc.a.run.app" },
};

// Every call jev answers can be written down, as it went over the wire, to train a model like it: with JEV_CALLS naming
// a CSV file, each is a row of the body sent, the body that came back, and the milliseconds from sending one to having
// the whole of the other (src/jev-calls.ts drives the app to make them). A row is what jev saw and said and nothing of
// the app that asked. A call that failed is not written, and gev's answers are not jev's.
const JEV_CALLS = process.env.JEV_CALLS;
const cell = (text: string) => `"${text.replaceAll('"', '""')}"`;
const writingCalls = JEV_CALLS
  ? {
      async fetch(url: string, init?: RequestInit): Promise<Response> {
        const start = performance.now();
        const response = await fetch(url, init);
        if (!response.ok || init?.method !== "POST" || !url.endsWith("/v1/systemone")) return response;
        const body = await response.text();
        const ms = Math.round(performance.now() - start);
        if (!statSync(JEV_CALLS, { throwIfNoEntry: false })?.size) appendFileSync(JEV_CALLS, "request,response,ms\n");
        appendFileSync(JEV_CALLS, `${cell(String(init.body))},${cell(body)},${ms}\n`);
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      },
    }
  : {};

const clients: Partial<Record<Endpoint, TypeSafeClient>> = {};
let gemini: GoogleGenAI | undefined;

// A person the list grants nothing may bring keys of their own (http.ts reads them off two headers, the browser keeps
// them and nothing here does): then that request is paid by them, is answered by jev whatever endpoint it named (gev is
// the house's), and is counted against nobody. A key is held only for as long as the request that carried it, except
// for the client built around it, which is kept so that a screen's forty requests do not build forty; those are kept
// under a hash of the key, a few at a time, and are never written anywhere.
export interface OwnKeys {
  jev: string;
  gemini: string;
}

/** Whose request it is, for the activity log: the route, the browser and visit it came from (web/activity.ts), and the person, if their token proved one. */
export interface Asker {
  route: string;
  visitor?: string;
  visit?: string;
  uid?: string;
}

const asking = new AsyncLocalStorage<{ endpoint: Endpoint; keys?: OwnKeys; asker?: Asker }>();
const KEPT_CLIENTS = 16;
const ownJev = new Map<string, TypeSafeClient>();
const ownGemini = new Map<string, GoogleGenAI>();

function kept<T>(kept: Map<string, T>, key: string, make: () => T): T {
  const id = createHash("sha256").update(key).digest("hex");
  let client = kept.get(id);
  if (!client) {
    if (kept.size >= KEPT_CLIENTS) kept.delete(kept.keys().next().value!);
    kept.set(id, (client = make()));
  }
  return client;
}

/** The keys the request being worked on brought, if it brought its own. */
export const ownKeys = (): OwnKeys | undefined => asking.getStore()?.keys;

/** The Gemini client for what is being worked on: the person's own, or the house's. */
export function geminiClient(): GoogleGenAI {
  const keys = ownKeys();
  if (keys) return kept(ownGemini, keys.gemini, () => new GoogleGenAI({ apiKey: keys.gemini }));
  return (gemini ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") }));
}

/** The first line of what a service said, which from Gemini is a JSON body with a message in it. */
function firstLine(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  // Gemini's is an envelope whose message is the body, whose message is the words; each layer is unwrapped until words are left.
  for (let layer = 0; layer < 3; layer++) {
    try {
      const inner = JSON.parse(message)?.error?.message;
      if (typeof inner !== "string") break;
      message = inner;
    } catch {
      break;
    }
  }
  return message.split("\n")[0]!.slice(0, 200);
}

/**
 * A model that failed a request someone made, written to the activity log as `model_error` (shared/activity.ts): the
 * service and model, the status and first line of what it said, after how long, and whose request it was. A request
 * the person stopped did not fail, and outside a request (a probe, an eval) nothing is written.
 */
export function noteFailure(service: string, model: string, error: unknown, start: number, signal?: AbortSignal) {
  const store = asking.getStore();
  if (!store || signal?.aborted || (error as Error)?.name === "AbortError") return;
  const status = (error as { status?: unknown })?.status;
  const { route, visitor, visit, uid } = store.asker ?? { route: "" };
  console.log(
    JSON.stringify({
      kind: "activity",
      event: "model_error",
      at: new Date().toISOString(),
      service,
      model,
      ...(typeof status === "number" ? { status } : {}),
      message: firstLine(error),
      ms: Math.round(performance.now() - start),
      route,
      keys: Boolean(store.keys),
      ...(visitor && visit ? { visitor, visit } : {}),
      ...(uid ? { uid } : {}),
    }),
  );
}

/** What went wrong at Gemini, said so that a person who brought the key knows it was theirs; never the key itself. */
export function geminiFailed(error: unknown): Error {
  const message = firstLine(error);
  return new Error(ownKeys() ? `Gemini didn't accept your Gemini API key, or the request: ${message}` : `Gemini didn't respond: ${message}`);
}

/**
 * Says whether each of a pair of keys works, with one small request to each service: a Jev question with an obvious
 * answer, and a count of tokens at Gemini, which costs nothing. `ok`, or what the service said.
 */
export async function checkKeys(keys: OwnKeys): Promise<{ jev: string; gemini: string }> {
  const said = (error: unknown) => firstLine(error) || "no answer";
  const [jev, geminiSaid] = await Promise.all([
    new TypeSafeClient({ apiKey: keys.jev, ...writingCalls })
      .systemOne({ model: JEV_MODEL, state: { message: "hello" } as any, questions: { greets: noul("Is the message a greeting?", { true: "Yes.", false: "No." }) } })
      .then(() => "ok", said),
    new GoogleGenAI({ apiKey: keys.gemini }).models.countTokens({ model: GEMINI_MODEL, contents: "hello" }).then(() => "ok", said),
  ]);
  return { jev, gemini: geminiSaid };
}

/** The endpoints that have a key here, and so can be chosen. */
export const endpoints = () => (Object.keys(ENDPOINTS) as Endpoint[]).filter((endpoint) => process.env[ENDPOINTS[endpoint].key]);

/** What a browser said it wants, as an endpoint: jev unless it plainly said gev. */
export const endpointNamed = (said: unknown): Endpoint => (said === "gev" ? "gev" : "jev");

/** Everything `work` sets going asks `endpoint`, however deep and however late; with `keys`, it asks jev with them. A model that fails it is put down to `asker`. */
export const answeredBy = <T>(endpoint: Endpoint, work: () => T, keys?: OwnKeys, asker?: Asker): T => asking.run({ endpoint: keys ? "jev" : endpoint, keys, asker }, work);

/** The endpoint that answers whatever is being worked on now. What is kept of its answers is kept under its name. */
export const endpoint = (): Endpoint => asking.getStore()?.endpoint ?? "jev";

export interface JevResult {
  answers: Record<string, any>;
  ms: number;
  inputTokens: number;
  /** Which endpoint answered. */
  endpoint: Endpoint;
  /** The part of `ms` that gev spent waiting on its model, which only gev says. */
  modelMs?: number;
}

/** One Jev request: every question is evaluated independently, in parallel. */
export async function askJev(state: unknown, questions: Questions, by: Endpoint = endpoint()): Promise<JevResult> {
  const { key, baseURL } = ENDPOINTS[by];
  const keys = ownKeys();
  const client = keys ? kept(ownJev, keys.jev, () => new TypeSafeClient({ apiKey: keys.jev, ...writingCalls })) : (clients[by] ??= new TypeSafeClient({ apiKey: requireEnv(key), ...(baseURL ? { baseURL } : {}), ...(by === "jev" ? writingCalls : {}) }));
  const start = performance.now();
  const response = await client.systemOne({ model: JEV_MODEL, state: state as any, questions }).catch((error: unknown) => {
    noteFailure(by, JEV_MODEL, error, start);
    // What a proxy in the way has to say can be a page of HTML; its first line is enough.
    const said = (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200);
    throw new Error(keys ? `Jev didn't accept your Jev API key, or the request: ${said}` : `${by} didn't respond: ${said}`);
  });
  const modelMs = (response as { gev?: { model_ms?: number } }).gev?.model_ms;
  return {
    answers: response.answers as Record<string, any>,
    ms: performance.now() - start,
    inputTokens: response.usage?.input_tokens ?? 0,
    endpoint: by,
    ...(typeof modelMs === "number" ? { modelMs: Math.round(modelMs) } : {}),
  };
}

/** Choice options ranked by probability, most likely first. */
export function ranked(answer: any): Array<[string, number]> {
  return Object.entries(answer.probabilities as Record<string, number>).sort((a, b) => b[1] - a[1]);
}

export function noulDecision(id: string, question: string, answer: any, threshold = 0.5): Decision {
  return { id, question, answer: answer.noul >= threshold ? "yes" : "no", p: answer.noul };
}

export function choiceDecision(id: string, question: string, answer: any): Decision {
  return { id, question, answer: answer.choice, p: answer.probabilities[answer.choice] };
}

/** Start times of recent Gemini requests, so callers can pace themselves under a requests-per-minute quota. */
export const geminiRequestTimes: number[] = [];

export interface GeminiResult {
  text: string;
  ms: number;
  /** Time to the first streamed chunk: the floor on how early any text can show up. */
  firstChunkMs: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Streams a JSON response from Gemini. `onPartial` receives the best-effort
 * parse of everything received so far, so callers can forward content to the
 * client before the response is complete.
 */
export async function streamGeminiJson(
  request: { system: string; prompt: string; schema?: unknown; signal?: AbortSignal },
  onPartial?: (value: any) => void,
): Promise<GeminiResult> {
  const gemini = geminiClient();
  const start = performance.now();
  // The pace is the house key's to keep; a person's own key has a quota of its own.
  if (!ownKeys()) geminiRequestTimes.push(Date.now());
  const stream = await gemini.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: request.prompt,
    config: {
      systemInstruction: request.system,
      responseMimeType: "application/json",
      ...(request.schema ? { responseJsonSchema: request.schema } : {}),
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      temperature: 0.4,
      ...(request.signal ? { abortSignal: request.signal } : {}),
    },
  }).catch((error: unknown) => {
    noteFailure("gemini", GEMINI_MODEL, error, start, request.signal);
    return Promise.reject(geminiFailed(error));
  });
  let text = "";
  let firstChunkMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    for await (const chunk of stream) {
      firstChunkMs ||= performance.now() - start;
      text += chunk.text ?? "";
      inputTokens = chunk.usageMetadata?.promptTokenCount ?? inputTokens;
      outputTokens =
        (chunk.usageMetadata?.candidatesTokenCount ?? 0) +
          (chunk.usageMetadata?.thoughtsTokenCount ?? 0) || outputTokens;
      if (onPartial && text.trim()) {
        try {
          onPartial(parsePartial(text));
        } catch {
          // Not enough of the document yet to parse; wait for more.
        }
      }
    }
  } catch (error) {
    // A stream can also break halfway.
    noteFailure("gemini", GEMINI_MODEL, error, start, request.signal);
    throw error;
  }
  return { text, ms: performance.now() - start, firstChunkMs, inputTokens, outputTokens };
}

/** One whole JSON response from the model that bakes components. Nothing waits on it, so it is not streamed. */
export async function bakeGeminiJson(request: { system: string; prompt: string; schema: unknown }): Promise<GeminiResult> {
  const gemini = geminiClient();
  const start = performance.now();
  if (!ownKeys()) geminiRequestTimes.push(Date.now());
  const response = await gemini.models.generateContent({
    model: BAKER_MODEL,
    contents: request.prompt,
    config: {
      systemInstruction: request.system,
      responseMimeType: "application/json",
      responseJsonSchema: request.schema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      temperature: 0.6,
    },
  }).catch((error: unknown) => {
    noteFailure("gemini", BAKER_MODEL, error, start);
    return Promise.reject(geminiFailed(error));
  });
  const usage = response.usageMetadata;
  const ms = performance.now() - start;
  return {
    text: response.text ?? "",
    ms,
    firstChunkMs: ms,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}
