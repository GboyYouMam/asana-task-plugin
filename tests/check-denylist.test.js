import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../scripts/check-denylist.js";

test("returns matching file:line for denylisted words, case-insensitive", () => {
  const hits = scan(["foo-corp", "secretclient"], {
    "docs/a.md": "Hello Foo-Corp\nok\nsecretclient here",
  });
  assert.deepEqual(hits, ["docs/a.md:1 foo-corp", "docs/a.md:3 secretclient"]);
});

test("empty denylist yields no hits", () => {
  assert.deepEqual(scan([], { "a.md": "anything" }), []);
});
