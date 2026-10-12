# 🎲 Table Chronicle

Record your in-person D&D sessions, turn them into a transcript of who said what, and let Claude turn each game night into a chapter of a **visual story game** you can play back together.

```
 🎙 Record at the table  →  📝 Transcript with speakers  →  ✨ Claude writes the chapter  →  ▶ Play it as a visual novel
```

**The story game includes:**
- Illustrated backdrops for each place (taverns, crypts, forests, camps…) that change with time of day and weather (rain, snow, fog, storms, embers).
- A portrait for every character, with the speaker highlighted, and dialogue taken from what was actually said at the table.
- Choice points where the party made big decisions. Pick the road not taken to see a "what if…", then see what really happened.
- A "previously on…" recap, loot, and open plot threads at the end of each chapter.
- Characters and places carry over from chapter to chapter, so the campaign builds up over time.

Want to see it first? Start the app (below) and click **Play ▶**. It shows a demo chapter until you have your own.

---

## Setup (one time, about 10 minutes)

1. **Install Node.js** (version 22 or newer) from <https://nodejs.org>.
2. **Download this project** and open a terminal in its folder.
3. Install it:
   ```bash
   npm install
   ```
4. **Get two API keys:**
   - **Claude** writes the chapters: create a key at <https://platform.claude.com>.
   - **AssemblyAI** turns audio into a transcript and works out who is speaking: create a key at <https://www.assemblyai.com>. You can skip this if you'd rather paste transcripts from another tool.
5. Copy `.env.example` to a new file called `.env` and paste in your keys:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ASSEMBLYAI_API_KEY=...
   ```
6. Start the app:
   ```bash
   npm start
   ```
   Then open **<http://localhost:3000>** in your browser.

## Using it on game night

1. **Party tab** (first time only): add everyone at the table: the DM, plus each player and their character's name. This helps the transcript spell fantasy names and tells Claude who plays whom.
2. **Record tab**: name the session, put the laptop in the middle of the table, and tap **●**. Tap **■** when you're done.
   - Plug it in, because a full session uses a lot of battery.
   - Audio saves every 5 seconds, so a crash or closed tab only loses a moment.
3. **Sessions tab**: tap **Transcribe**. It usually takes a few minutes per hour of audio, and you can close the page meanwhile.
4. **Who's who?** The transcript labels voices as Speaker A, B, C… Type the right name next to each one; sample lines help you tell who's who.
5. Tap **✨ Write the chapter**. Claude reads the whole session (skipping rules talk and snack breaks) and writes the chapter. This takes a few minutes.
6. Tap **▶ Play chapter**. Tap or press Space to advance, ← to go back, **Auto** to let it play by itself, and number keys to pick choices.

### Recording with a phone instead

Browsers only let a page use the microphone on `localhost` or over `https`. So if the app runs on your laptop, a phone on the same Wi-Fi can't record through it directly. You have two easy options:

- **Use your phone's voice memo app**, then in **Sessions** tap **+ New session…** and **Upload audio**. Most formats work (m4a, mp3, wav, webm…).
- Record on the laptop running the app, as described above.

### Already have a transcript?

If you used Zoom, Otter, Discord bots or anything else, choose **Paste transcript** on a session. Use one line per speaker, like `DM: You enter the crypt.` Timestamps like `[00:12:03]` are fine too.

## What does it cost?

These are rough estimates; check each provider's pricing page for current rates.

- **Transcription (AssemblyAI)** is billed per hour of audio. A 4-hour session is usually around a dollar or less.
- **Writing the chapter (Claude)**: a 4-hour session is roughly 60–80k words of transcript to read plus a long chapter to write, which typically comes to a dollar or two per chapter.

## Where's my data?

Everything stays on your computer in the `data/` folder:

- `data/campaign.json` holds your party, characters, places and every chapter.
- `data/sessions/…/` holds each session's recording and transcript.

Back up that folder to keep your campaign safe. Audio is only sent to AssemblyAI for transcription, and the transcript is only sent to Claude to write the chapter.

## For tinkerers

- `server.js` is the small web server and background jobs.
- `src/transcribe.js` handles AssemblyAI transcription with speaker labels, plus parsing pasted transcripts.
- `src/story.js` holds the Claude prompt and the chapter format (a JSON schema, so the output always fits the game).
- `public/art.js` draws all the scenery and portraits as code, so no image generation is needed.
- `public/play.js` is the visual-novel player.
- Run the tests with `npm test`.

If a chapter gets something wrong (a misheard name, a line given to the wrong person), fix the names under **Who's who?** and tap **Rewrite chapter**.
