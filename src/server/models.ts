import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
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

const clients: Partial<Record<Endpoint, TypeSafeClient>> = {};
const asking = new AsyncLocalStorage<Endpoint>();
let gemini: GoogleGenAI | undefined;

/** The endpoints that have a key here, and so can be chosen. */
export const endpoints = () => (Object.keys(ENDPOINTS) as Endpoint[]).filter((endpoint) => process.env[ENDPOINTS[endpoint].key]);

/** What a browser said it wants, as an endpoint: jev unless it plainly said gev. */
export const endpointNamed = (said: unknown): Endpoint => (said === "gev" ? "gev" : "jev");

/** Everything `work` sets going asks `endpoint`, however deep and however late. */
export const answeredBy = <T>(endpoint: Endpoint, work: () => T): T => asking.run(endpoint, work);

/** The endpoint that answers whatever is being worked on now. What is kept of its answers is kept under its name. */
export const endpoint = (): Endpoint => asking.getStore() ?? "jev";

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
  const client = (clients[by] ??= new TypeSafeClient({ apiKey: requireEnv(key), ...(baseURL ? { baseURL } : {}) }));
  const start = performance.now();
  const response = await client.systemOne({ model: JEV_MODEL, state: state as any, questions }).catch((error: unknown) => {
    // What a proxy in the way has to say can be a page of HTML; its first line is enough.
    throw new Error(`${by} did not answer: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200)}`);
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
  gemini ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  const start = performance.now();
  geminiRequestTimes.push(Date.now());
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
  });
  let text = "";
  let firstChunkMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
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
  return { text, ms: performance.now() - start, firstChunkMs, inputTokens, outputTokens };
}

/** One whole JSON response from the model that bakes components. Nothing waits on it, so it is not streamed. */
export async function bakeGeminiJson(request: { system: string; prompt: string; schema: unknown }): Promise<GeminiResult> {
  gemini ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  const start = performance.now();
  geminiRequestTimes.push(Date.now());
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
