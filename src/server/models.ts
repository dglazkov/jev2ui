import "dotenv/config";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { parse as parsePartial } from "partial-json";
import type { Decision } from "../shared/events.js";

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
export const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest";
/** Writes code, not words, and only when a screen needs something the kit cannot draw (mock/bake.ts). */
export const BAKER_MODEL = process.env.BAKER_MODEL ?? "gemini-3.8-flash";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (expected in .env)`);
  return value;
}

let jev: TypeSafeClient | undefined;
let gemini: GoogleGenAI | undefined;

export interface JevResult {
  answers: Record<string, any>;
  ms: number;
  inputTokens: number;
}

/** One Jev request: every question is evaluated independently, in parallel. */
export async function askJev(state: unknown, questions: Questions): Promise<JevResult> {
  jev ??= new TypeSafeClient({ apiKey: requireEnv("JEV_API_KEY") });
  const start = performance.now();
  const response = await jev.systemOne({ model: JEV_MODEL, state: state as any, questions });
  return {
    answers: response.answers as Record<string, any>,
    ms: performance.now() - start,
    inputTokens: response.usage?.input_tokens ?? 0,
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
