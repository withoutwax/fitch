// Decoding for documents returned by the Firestore REST API, used by the
// server to read public collections without the client SDK.

export type RestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: RestValue[] } }
  | { mapValue: { fields?: Record<string, RestValue> } };

export interface RestDocument {
  /** projects/{p}/databases/(default)/documents/{collection}/{id} */
  name: string;
  fields?: Record<string, RestValue>;
}

export function decodeValue(v: RestValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields);
  return undefined;
}

export function decodeFields(fields: Record<string, RestValue> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, decodeValue(v)]));
}

export const docId = (d: RestDocument) => d.name.slice(d.name.lastIndexOf("/") + 1);

/** Every document in a top-level collection, following pagination. Throws on any HTTP error. */
export async function listCollection(collection: string): Promise<RestDocument[]> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set");
  const host =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" ? "http://127.0.0.1:8080" : "https://firestore.googleapis.com";
  const base = `${host}/v1/projects/${projectId}/databases/(default)/documents/${collection}`;

  const out: RestDocument[] = [];
  let pageToken = "";
  do {
    const url = new URL(base);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (apiKey && !host.startsWith("http://")) url.searchParams.set("key", apiKey);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Reading ${collection} from Firestore failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { documents?: RestDocument[]; nextPageToken?: string };
    out.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}
