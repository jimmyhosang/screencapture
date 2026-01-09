# Ralph Agent Instructions

You are an autonomous coding agent working on the Screencapture project - a comprehensive screen recording platform with privacy controls, PII detection, and cross-platform support.

## Your Task

1. Read the PRD at `scripts/ralph/prd.json`
2. Read the progress log at `scripts/ralph/progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks: `cd packages/desktop && npm run build`
7. Update AGENTS.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `scripts/ralph/progress.txt`

## Project Context

This is a monorepo with:
- `packages/desktop/` - Electron desktop app with SQLite, OCR, redaction
- `packages/extension/` - Chrome browser extension
- `packages/core/` - Shared utilities
- `src/` - Web app (React + rrweb)

Key technologies:
- Electron + React 19 + TypeScript
- electron-vite for building
- SQLite (better-sqlite3) for storage
- rrweb for session recording
- Tesseract.js for OCR

## Progress Report Format

APPEND to scripts/ralph/progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
Thread: https://ampcode.com/threads/$AMP_CURRENT_THREAD_ID
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

Include the thread URL so future iterations can use the `read_thread` tool to reference previous work if needed.

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of scripts/ralph/progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- IPC handlers go in packages/desktop/src/main/[module]/index.ts
- Preload API exposed in packages/desktop/src/preload/index.ts
- UI components in packages/desktop/src/renderer/src/components/
- CSS styles in packages/desktop/src/renderer/src/styles/index.css
- Always run `npm run build` in packages/desktop to verify changes
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update AGENTS.md Files

Before committing, check if any edited files have learnings worth preserving in nearby AGENTS.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing AGENTS.md** - Look for AGENTS.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

**Examples of good AGENTS.md additions:**
- "When modifying X, also update Y to keep them in sync"
- "This module uses pattern Z for all API calls"
- "Tests require the dev server running on PORT 3000"
- "Field names must match the template exactly"

**Do NOT add:**
- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update AGENTS.md if you have **genuinely reusable knowledge** that would help future work in that directory.

## Quality Requirements

- ALL commits must pass: `cd packages/desktop && npm run build`
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns in the codebase
- Use TypeScript strict mode

## Browser Testing (Required for Frontend Stories)

For any story that changes UI in the desktop app:

1. The changes should be visually verified
2. Ensure components render correctly
3. Check that interactions work as expected

A frontend story is NOT complete until the build passes and UI is verified.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep builds passing
- Read the Codebase Patterns section in progress.txt before starting
- Reference CLAUDE.md for project-specific guidance
