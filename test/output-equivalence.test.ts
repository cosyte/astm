/**
 * Output equivalence: the package observes the same as it did before its performance work.
 *
 * The escape-aware split, the record tokenizer, the parse's freezing, the framed write and the
 * record build were rewritten to allocate less, with the promise that nothing a caller can see
 * moves: every parsed record and field, every warning and tokenizer report in its order, every
 * error, checksum and built or framed byte, and which objects come back frozen, including framed
 * streams split at every byte boundary. `test/_helpers/output-corpus.ts` records all of that for
 * each item of a synthetic corpus and hashes it; the digests in
 * `test/fixtures/equivalence/output-digests.json` were captured from the source before the work
 * (`ASTM_CAPTURE_DIGESTS=1 pnpm exec vitest run test/output-equivalence.test.ts` writes them). This
 * test holds the current source to every one.
 *
 * A digest that moves is a behaviour change. Recapture only for a change that means to move what
 * a caller sees, and say so in its pull request.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  corpusBuild,
  corpusCodec,
  corpusCompose,
  corpusFramed,
  corpusStreams,
  observeBuild,
  observeCodec,
  observeCompose,
  observeFramed,
  observeStream,
} from "./_helpers/output-corpus.js";

const DIGESTS = fileURLToPath(
  new URL("./fixtures/equivalence/output-digests.json", import.meta.url),
);

const capture = process.env["ASTM_CAPTURE_DIGESTS"] === "1";

/** Every digest of the corpus, keyed by its label, in corpus order. */
function digests(): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (label: string, digest: string): void => {
    if (Object.hasOwn(out, label)) throw new Error(`duplicate corpus label ${label}`);
    out[label] = digest;
  };
  for (const s of corpusStreams()) put(`parse:${s.label}`, observeStream(s.value));
  for (const f of corpusFramed()) put(`frames:${f.label}`, observeFramed(f.value));
  for (const c of corpusCompose()) put(`compose:${c.label}`, observeCompose(c.value));
  for (const b of corpusBuild()) put(`build:${b.label}`, observeBuild(b.value));
  for (const c of corpusCodec()) put(`codec:${c.label}`, observeCodec(c.value));
  return out;
}

describe("output equivalence against the digests captured before the performance work", () => {
  it("observes every item of the corpus exactly as before", () => {
    const head = digests();
    if (capture) {
      writeFileSync(DIGESTS, `${JSON.stringify(head, null, 2)}\n`);
      return;
    }
    const base = JSON.parse(readFileSync(DIGESTS, "utf8")) as Record<string, string>;
    expect(Object.keys(head)).toEqual(Object.keys(base));
    const moved = Object.keys(base).filter((label) => head[label] !== base[label]);
    expect(moved).toEqual([]);
    // The corpus is the size the pull request reports, so a shrunken corpus cannot pass quietly.
    expect(Object.keys(base).length).toBeGreaterThan(700);
  }, 300_000);
});
