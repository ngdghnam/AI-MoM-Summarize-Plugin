# Sessions and task tracking

Applies to every agent session and every defined task, including analysis and design discussions.

## Start and end checkpoints

`PROGRESS.md` is the project status log: current work, completed and unfinished items, test/check results with dates, known issues, blockers, and next steps. `DECISION.md` records important design or workflow decisions, why they were made, alternatives actually considered, constraints, date, and approval status. These files complement detailed task files and canonical technical documentation.

- At session start, after onboarding and before substantive work, read and update `PROGRESS.md` and `DECISION.md`. Record the date, objective, observed HEAD/working-tree state, resumed work, blockers, and next steps.
- In `DECISION.md`, review relevant decisions and record new or changed decisions with date, rationale, alternatives actually considered, constraints, and approval status. If there is no new decision, add a brief checkpoint; do not invent or duplicate a decision.
- Before ending or handing off, update both files. Progress must state completed and unfinished work, checks run or not run, blockers, and next actions. Decisions must capture final choices, changed proposal status, and unresolved decisions; explicitly state when there are no additional decisions.
- Apply this when work is incomplete, blocked, or paused at the user's request; do not mark unfinished work complete. If interrupted before saving, reconcile the missing checkpoint at the next session.
- These tracking updates are a narrow exception to the no-file-edit rule for explain/analyze requests; they do not authorize application changes.

## Create and maintain tasks

Before starting a defined task, create a separate, descriptively numbered file in the repository-root `todo/` directory. Include objective, status, dependencies, affected components, actionable checklist, acceptance criteria, and a self-contained Context section. Distinguish proposed behavior from implemented behavior.

Update the task file as work proceeds, including check results, blockers, and remaining work. Split newly defined tasks into their own files. Delete only that task's file after its deliverable, checks, and required documentation are complete; retain unfinished or blocked tasks. Before deletion, retain durable decisions in canonical docs and report the outcome and verification.
