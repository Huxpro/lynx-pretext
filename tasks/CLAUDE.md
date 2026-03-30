# Ralph Agent Instructions

You are an autonomous coding agent porting chenglou/pretext to Lynx.

> **📚 Learning Materials:** See [AGENT.md](AGENT.md) for a catalog of technical documentation including MTS/BTS architecture patterns, shared module pitfalls, and more.

## Project Context

- **Working directory:** ~/github/lynx-pretext (this project)
- **Reference source:** ~/github/pretext (the original browser Pretext — READ files from here, do NOT modify)
- **Architecture:** Pure JS text measurement & layout library running on Lynx main thread
- **Key adaptation:** Replace Canvas `measureText()` with `lynx.getTextInfo()` on main thread

## Your Task

1. Read the PRD at `tasks/prd.json`
2. Read the progress log at `tasks/progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
7. Update CLAUDE.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `tasks/progress.txt`

## Porting Guidelines

- **Read the source first:** Before implementing any story, read the corresponding file from `~/github/pretext/src/` or `~/github/pretext/pages/demos/`. Each story's `notes` field has the exact source path.
- **analysis.ts and line-break.ts** are mostly direct ports. Change import paths only.
- **measurement.ts** is the main adaptation point: replace `OffscreenCanvas`/`Canvas` with `lynx.getTextInfo()`.
- **layout.ts** wires the layers together. Port the logic, adapt measurement calls.
- **Demo pages** replace DOM APIs with Lynx/ReactLynx equivalents.
- **@formatjs/intl-segmenter** replaces native `Intl.Segmenter`.

## Verification Strategy

The primary verification oracle is `getTextInfo` with `maxWidth`:

```ts
// Native oracle
const native = lynx.getTextInfo(text, { fontSize, fontFamily, maxWidth })
// native.content = ['line 1 text', 'line 2 text', ...]

// Our implementation
const { lines } = layoutWithLines(prepared, maxWidthPx, lineHeight)
// lines[i].text should match native.content[i]
```

Compare line-by-line text content. If a line diverges, the bug is in either:
1. Segment measurement (individual widths don't sum correctly)
2. Line breaking logic (break decision differs from native)
3. Segment merging (analysis produced wrong segments)

## Progress Report Format

APPEND to tasks/progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Consolidate Patterns

If you discover a **reusable pattern**, add it to the `## Codebase Patterns` section at the TOP of tasks/progress.txt:

```
## Codebase Patterns
- Example: lynx.getTextInfo returns width in px, no unit string
- Example: @formatjs/intl-segmenter needs explicit import before use
```

## Quality Requirements

- ALL commits must pass typecheck
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns from ~/github/pretext

## Lynx DevTool Verification (MANDATORY for demo stories)

For any demo story (US-010 through US-017), you MUST:

1. Run `pnpm build` — must pass
2. Start dev server in background: `rspeedy dev &`
3. Wait for dev server to be ready (check for "http://localhost:3004" in output)
4. Verify device connected:
   ```
   node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs list-clients
   ```
   Expected: at least one client at localhost:8901
5. Open the demo page (use the `open` command, NOT `open-url`):
   ```
   node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs open "http://localhost:<port>/<page-name>.lynx.bundle" --client localhost:8901
   ```
6. Wait 3 seconds for page to render, then list sessions:
   ```
   node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs list-sessions --client localhost:8901
   ```
7. Take screenshot:
   ```
   node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs take-screenshot --client localhost:8901 --session <session_id> --output /tmp/screenshot-<page-name>.png
   ```
8. Verify screenshot exists and is non-empty: `ls -la /tmp/screenshot-<page-name>.png`

**IMPORTANT:** Do NOT use `npx devtool` — use the exact path above.
**IMPORTANT:** A demo story is NOT complete until screenshot is taken and verified.
**IMPORTANT:** Kill the dev server after verification: `kill %1` or `pkill -f "rspeedy dev"`

Demo page names (use in <page-name>):
- US-010: basic-height
- US-011: layout-with-lines
- US-012: shrinkwrap
- US-013: variable-flow
- US-014: bubbles (shared logic, no separate page — verify via US-015)
- US-015: bubbles
- US-016: dynamic-layout (geometry data)
- US-017: dynamic-layout

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally.

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in tasks/progress.txt before starting
- NEVER modify files in ~/github/pretext — that's the read-only reference
