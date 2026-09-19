// Firestore, as much of it as is used: documents read, listed, and written in one commit, over REST. The
// client library would bring gRPC with it for the sake of three calls. Whoever the process runs as is who asks:
// the service account on Cloud Run, `gcloud auth application-default login` on a laptop. Browsers cannot reach
// the database at all (no rules are published for it), so what may be read or written is decided here.

import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.FIREBASE_PROJECT;
const DATABASE = `projects/${PROJECT}/databases/(default)`;
const auth = new GoogleAuth({ scopes: "https://www.googleapis.com/auth/datastore" });

/** A document's fields as Firestore spells them: every value wrapped in its type. */
type Value = { stringValue: string } | { integerValue: string } | { doubleValue: number } | { booleanValue: boolean } | { nullValue: null } | { timestampValue: string } | { mapValue: { fields?: Record<string, Value> } } | { arrayValue: { values?: Value[] } };
export type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

function wrap(value: Plain): Value {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(wrap) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, wrap(inner)])) } };
}

function unwrap(value: Value): Plain {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(unwrap);
  if ("mapValue" in value) return unwrapAll(value.mapValue.fields);
  return null;
}

const unwrapAll = (fields: Record<string, Value> = {}) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, unwrap(value)]));

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const headers = await auth.getRequestHeaders();
  headers.set("Content-Type", "application/json");
  const response = await fetch(`https://firestore.googleapis.com/v1/${DATABASE}/documents${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Firestore said ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

export interface Doc {
  id: string;
  data: Record<string, Plain>;
}

const doc = (found: any): Doc => ({ id: decodeURIComponent(String(found.name).split("/").pop()!), data: unwrapAll(found.fields) });

/** The document at a path such as `people/abc`, or nothing. */
export async function read(path: string): Promise<Doc | undefined> {
  const found = await call("GET", `/${path}`);
  return found && doc(found);
}

/** Every document of a collection. Meant for small ones: it stops at three hundred. */
export async function list(collection: string): Promise<Doc[]> {
  const found = await call("GET", `/${collection}?pageSize=300`);
  return (found?.documents ?? []).map(doc);
}

/**
 * Sets some fields of a document (making it if need be) and adds to a counter in it, as one write; answers
 * what the counter came to. Adding is Firestore's own doing, so two at once cannot both read the old figure.
 * A field path whose parts are not plain names wants them in backticks: days.`2026-09-19`.
 */
export async function count(path: string, counter: string, fields: Record<string, Plain>): Promise<number> {
  const name = `${DATABASE}/documents/${path}`;
  const write = {
    update: { name, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, wrap(value)])) },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: [{ fieldPath: counter, increment: { integerValue: "1" } }],
  };
  const done = await call("POST", ":commit", { writes: [write] });
  return Number(done.writeResults[0].transformResults[0].integerValue);
}
