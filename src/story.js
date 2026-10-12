// Claude turns a session transcript into one chapter of the visual story game,
// and the chapter is merged into the running campaign (characters, places, recaps).

import Anthropic from "@anthropic-ai/sdk";

export const SETTINGS = [
  "forest", "dungeon", "tavern", "town", "castle", "cave", "mountains", "sea",
  "desert", "swamp", "temple", "camp", "road", "underdark", "otherworld",
];
export const TIMES = ["dawn", "day", "dusk", "night"];
export const MOODS = ["calm", "mysterious", "tense", "combat", "festive", "sad", "eerie"];
export const WEATHER = ["clear", "rain", "snow", "fog", "storm", "embers"];
export const EMBLEMS = [
  "sword", "staff", "bow", "dagger", "shield", "holy", "music", "beast",
  "skull", "crown", "flame", "leaf", "eye", "coin", "hammer",
];

const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" };
const strList = { type: "array", items: str };

export const CHAPTER_SCHEMA = obj({
  title: str,
  recap: str,
  characters: {
    type: "array",
    items: obj({
      id: str,
      name: str,
      kind: { type: "string", enum: ["pc", "npc", "creature"] },
      player: nullable(str),
      description: str,
      color: str,
      emblem: { type: "string", enum: EMBLEMS },
    }),
  },
  locations: {
    type: "array",
    items: obj({
      id: str,
      name: str,
      setting: { type: "string", enum: SETTINGS },
      description: str,
    }),
  },
  scenes: {
    type: "array",
    items: obj({
      title: str,
      location_id: str,
      time_of_day: { type: "string", enum: TIMES },
      mood: { type: "string", enum: MOODS },
      weather: { type: "string", enum: WEATHER },
      characters_present: strList,
      beats: {
        type: "array",
        items: obj({
          kind: { type: "string", enum: ["narration", "dialogue", "action"] },
          speaker_id: nullable(str),
          text: str,
        }),
      },
      choice: nullable(
        obj({
          prompt: str,
          options: {
            type: "array",
            items: obj({ text: str, outcome: str, chosen: { type: "boolean" } }),
          },
        }),
      ),
    }),
  },
  loot: strList,
  plot_threads: strList,
});

const SYSTEM_PROMPT = `You are the chronicler for a group's in-person Dungeons & Dragons campaign. You receive the transcript of one game night, recorded by a single microphone on the table, and turn it into one chapter of a visual novel the players can replay.

How to read the transcript:
- The recording catches everything: table talk, rules questions, dice maths, snack breaks, jokes about real life. Leave out what isn't part of the story, but keep in-character jokes and memorable table moments that shaped the game.
- Speech recognition makes mistakes, especially with fantasy names. Use the known characters and places to correct spellings.
- Speaker labels can be wrong when people talk over each other. Use context to decide who really said something.
- The DM narrates and voices every NPC and monster. When the DM speaks as an NPC, attribute that line to the NPC.
- Players often speak out of character ("I'm going to attack the goblin"). Turn that into what their character does or says.

How to write the chapter:
- Follow what actually happened, in order. Don't invent major events, outcomes, or deaths. You may add small sensory details so scenes come alive.
- Keep memorable lines close to how they were said at the table. The players should recognise their own words.
- Split the night into scenes wherever the place, time, or situation changes. A typical session is 6 to 20 scenes; each scene has roughly 4 to 20 beats.
- A "narration" beat is the storyteller's voice (speaker_id null). A "dialogue" beat is a character speaking (speaker_id set). An "action" beat describes what one character does (speaker_id set to that character).
- When the party faced a real decision (a fork in the road, a deal, spare or kill), add a choice to the scene that ends at that decision. List the option the party took with chosen=true, plus one or two options they considered or could have taken, each with a short outcome. The chosen option's outcome is what really happened next; the others are brief "what if" guesses.
- recap: two or three sentences in the style of "Previously on...".

Characters and places:
- Reuse the id of any character or location that already exists in the campaign. New ids are short lowercase slugs like "thorin" or "sunken-crypt".
- List every character who appears or speaks in this chapter, including existing ones. Update descriptions with anything new learned this session.
- Player characters have kind "pc" and player set to the person playing them. NPCs and monsters have player null.
- color is a hex colour that suits the character (e.g. "#7a3cff"). Keep an existing character's colour. emblem is the symbol that best fits them.
- Every scene's location_id and characters_present must refer to ids in your characters and locations lists.

loot: notable items, gold, or rewards gained. plot_threads: open questions and leads to follow next time.`;

function formatTime(ms) {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `[${hh}:${mm}:${ss}] `;
}

export function formatTranscript(utterances, speakerNames = {}) {
  return utterances
    .map((u) => `${formatTime(u.start)}${speakerNames[u.speaker] || `Speaker ${u.speaker}`}: ${u.text}`)
    .join("\n");
}

function campaignContext(campaign) {
  return JSON.stringify(
    {
      campaign: campaign.name,
      table: campaign.roster,
      characters: campaign.characters.map(({ id, name, kind, player, description, color, emblem }) => ({
        id, name, kind, player, description, color, emblem,
      })),
      locations: campaign.locations.map(({ id, name, setting, description }) => ({
        id, name, setting, description,
      })),
      previous_chapters: campaign.chapters.map((c) => ({
        title: c.title,
        recap: c.recap,
        plot_threads: c.plot_threads,
      })),
    },
    null,
    2,
  );
}

/** Asks Claude to write one chapter from a session's transcript. */
export async function writeChapter({ campaign, session, client = new Anthropic() }) {
  const transcript = formatTranscript(session.utterances, session.speakerNames);

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    // If a safety check ever declines (dark fantasy can trip one), retry on Anthropic's
    // recommended fallback model instead of failing the whole chapter.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: CHAPTER_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `<campaign>\n${campaignContext(campaign)}\n</campaign>` },
          {
            type: "text",
            text: `<transcript title="${session.title}">\n${transcript}\n</transcript>\n\nWrite the chapter for this session.`,
          },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error(
      `Claude declined to write this chapter (${message.stop_details?.category ?? "no category"}).`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The chapter was too long and got cut off. Try splitting the session in two.");
  }
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text);
}

/** Merges a freshly written chapter into the campaign. Returns the stored chapter. */
export function addChapter(campaign, chapter, session) {
  for (const c of chapter.characters) {
    const existing = campaign.characters.find((x) => x.id === c.id);
    if (existing) Object.assign(existing, c, { color: existing.color || c.color });
    else campaign.characters.push(c);
  }
  for (const l of chapter.locations) {
    const existing = campaign.locations.find((x) => x.id === l.id);
    if (existing) Object.assign(existing, l);
    else campaign.locations.push(l);
  }

  // Re-running a session replaces its old chapter instead of adding a duplicate.
  const index = campaign.chapters.findIndex((c) => c.sessionId === session.id);
  const stored = {
    id: session.id,
    sessionId: session.id,
    number: index >= 0 ? campaign.chapters[index].number : campaign.chapters.length + 1,
    date: session.createdAt.slice(0, 10),
    title: chapter.title,
    recap: chapter.recap,
    scenes: chapter.scenes,
    loot: chapter.loot,
    plot_threads: chapter.plot_threads,
  };
  if (index >= 0) campaign.chapters[index] = stored;
  else campaign.chapters.push(stored);
  return stored;
}
