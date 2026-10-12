import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parsePastedTranscript } from "../src/transcribe.js";
import { formatTranscript, addChapter, writeChapter, CHAPTER_SCHEMA } from "../src/story.js";
import { emptyCampaign } from "../src/storage.js";

const demo = JSON.parse(fs.readFileSync(new URL("../public/demo/campaign.json", import.meta.url)));

test("parses pasted transcripts with and without timestamps", () => {
  const lines = parsePastedTranscript(`
DM: You enter the crypt.
It smells of old candles.
[00:12:03] Sam: I check for traps.
(1:02:10) Riley: Dibs on the gold: all of it.
`);
  assert.deepEqual(lines.map((l) => l.speaker), ["DM", "Sam", "Riley"]);
  assert.equal(lines[0].text, "You enter the crypt. It smells of old candles.");
  assert.equal(lines[2].text, "Dibs on the gold: all of it.");
});

test("formats transcripts with speaker names and times", () => {
  const text = formatTranscript(
    [{ speaker: "A", text: "Roll initiative.", start: 3723000 }, { speaker: "B", text: "Nat 20!", start: null }],
    { A: "DM" },
  );
  assert.equal(text, "[01:02:03] DM: Roll initiative.\nSpeaker B: Nat 20!");
});

test("adds a chapter, merges characters, and replaces it when rewritten", () => {
  const campaign = emptyCampaign();
  campaign.characters.push({ id: "thorin", name: "Thorin", color: "#111111", description: "old" });
  const chapter = structuredClone(demo.chapters[0]);
  chapter.characters = demo.characters;
  chapter.locations = demo.locations;
  const session = { id: "2026-10-03-abc123", createdAt: "2026-10-03T20:00:00Z" };

  addChapter(campaign, chapter, session);
  assert.equal(campaign.chapters.length, 1);
  assert.equal(campaign.characters.length, demo.characters.length);
  const thorin = campaign.characters.find((c) => c.id === "thorin");
  assert.equal(thorin.color, "#111111", "keeps an existing character's colour");
  assert.match(thorin.description, /dwarf/, "updates the description");

  addChapter(campaign, { ...chapter, title: "Rewritten" }, session);
  assert.equal(campaign.chapters.length, 1);
  assert.equal(campaign.chapters[0].title, "Rewritten");
  assert.equal(campaign.chapters[0].number, 1);
});

test("the demo chapter matches the shape Claude is asked to produce", () => {
  const check = (schema, value, where) => {
    if (schema.anyOf) {
      if (value === null) return;
      return check(schema.anyOf[0], value, where);
    }
    if (schema.type === "object") {
      assert.equal(typeof value, "object", where);
      for (const key of schema.required) {
        assert.ok(key in value, `${where}.${key} is missing`);
        check(schema.properties[key], value[key], `${where}.${key}`);
      }
    } else if (schema.type === "array") {
      assert.ok(Array.isArray(value), where);
      value.forEach((v, i) => check(schema.items, v, `${where}[${i}]`));
    } else if (schema.enum) {
      assert.ok(schema.enum.includes(value), `${where}: ${value} not in ${schema.enum}`);
    } else {
      assert.equal(typeof value, schema.type, where);
    }
  };
  const ch = demo.chapters[0];
  check(CHAPTER_SCHEMA, { ...ch, characters: demo.characters, locations: demo.locations }, "chapter");

  const ids = new Set(demo.characters.map((c) => c.id));
  const locs = new Set(demo.locations.map((l) => l.id));
  for (const s of ch.scenes) {
    assert.ok(locs.has(s.location_id), s.location_id);
    for (const id of s.characters_present) assert.ok(ids.has(id), id);
    for (const b of s.beats) if (b.speaker_id) assert.ok(ids.has(b.speaker_id), b.speaker_id);
  }
});

test("writeChapter sends the transcript and parses Claude's JSON", async () => {
  let request;
  const fakeClient = {
    beta: {
      messages: {
        stream(params) {
          request = params;
          return {
            finalMessage: async () => ({
              stop_reason: "end_turn",
              content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify({ title: "T" }) }],
            }),
          };
        },
      },
    },
  };
  const session = {
    title: "Night 1",
    utterances: [{ speaker: "A", text: "You wake in a cell.", start: 0 }],
    speakerNames: { A: "DM" },
  };
  const result = await writeChapter({ campaign: emptyCampaign(), session, client: fakeClient });
  assert.deepEqual(result, { title: "T" });
  assert.equal(request.model, "claude-opus-5-5");
  assert.equal(request.output_config.format.type, "json_schema");
  assert.match(request.messages[0].content[1].text, /\[00:00:00\] DM: You wake in a cell\./);
});

test("writeChapter reports a refusal instead of returning junk", async () => {
  const fakeClient = {
    beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }) }) } },
  };
  await assert.rejects(
    writeChapter({ campaign: emptyCampaign(), session: { title: "x", utterances: [], speakerNames: {} }, client: fakeClient }),
    /declined/,
  );
});
