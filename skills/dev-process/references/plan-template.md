# Plan template

A plan is written just before its phase or milestone starts. It has these parts, in this order.
Each one is required; write "none" rather than leaving one out.

1. **Header:** the goal in one sentence, the architecture in a few, the tech stack, the spec it
   argues from (a link), and its scope.
2. **Preconditions, verified:** what must be true before work starts, each with the command that
   checked it and what it showed.
3. **Environment facts:** versions, operating system, accounts, paths and limits the plan relies
   on, each with the command that checked it.
4. **Decisions:** a table of choice, alternatives and why. Mark the sticky ones; they are approved
   with the plan, and any new sticky decision during the work stops it.
5. **Tasks,** numbered. Each task names the files it creates or changes and, when tasks share
   code, the interfaces it produces and consumes. Each task is a test commit, then one or more
   code commits. Every step ends in a verification: a command and the result to expect.
6. **Known pitfalls:** what is likely to go wrong, and what to do about it.
7. **Rollback:** how to undo the work if it has to come out.
8. **Execution log:** filled in during the work.

## Skeleton

```markdown
# <Milestone or phase>: <name>

**Goal:** ...
**Architecture:** ...
**Tech stack:** ...
**Spec:** [link](...)
**Scope:** ...

## Preconditions (verified)

| Precondition | Command | Result |
|---|---|---|

## Environment facts

| Fact | Command | Result |
|---|---|---|

## Decisions

| Decision | Choice | Alternatives | Why | Sticky |
|---|---|---|---|---|

## Tasks

### Task 1: <name>

**Files:** create `...`; test `...`
**Interfaces (produces):** ...

- [ ] **Step 1: Write the tests.** ... Run `<test command>`. Expect FAIL. Commit: `test(<scope>): ...`
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run `<test command>`.** Expect PASS. Commit: `feat(<scope>): ...`

## Known pitfalls

## Rollback

## Execution log

| Date | Task | Evidence (command and result) | Notes |
|---|---|---|---|
```
