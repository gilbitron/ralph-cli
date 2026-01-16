# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

## Your Task

1. Read the plan at `plan.md` (in the same directory as this file)
1. Read the progress log at `progress.md`
1. Pick the next uncompleted task to work on from the plan
1. Implement that single task only. Do not work on multiple tasks at once.
1. Run quality checks (e.g., lint, test - use whatever your project requires)
1. If checks pass, commit ALL changes with a sensible commit message.
1. Update the plan to set the task as completed. Check off the task with `[x]` in the plan.
1. Append your progress to `progress.md`

## Progress Report Format

APPEND to progress.md (never replace, always append):
```
## [Date/Time] - [Task Title]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Quality Requirements

- ALL commits must pass your project's quality checks (lint, test, etc.)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Stop Condition

After completing a task, check if ALL tasks have been completed.

If ALL tasks are complete, reply with:
<promise>COMPLETE</promise>

If there are still tasks that are not complete, end your response normally (another iteration will pick up the next task).

## Important

- Work on ONE task per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.md before starting
