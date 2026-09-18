# today-only

The Today projection and work streams, on their own.

```bash
pnpm --filter @aldus-palace/example-today-only start
```

It seeds five commitments that exercise **all four time models** — a deadline, an
availability window, an AI-suggested slot, and no time at all — then prints:

- **Today**: what to do now, what's next, what is at risk, what is unscheduled
- **Work streams**: the rebuildable grouping over the same commitments

What you are looking at (and do not have to build yourself):

- four separate time fields instead of one `dueDate`
- **no overdue state**: a missed deadline is a risk (`status = 'risk'`), not a failure label
- a Today view that answers “what now?”, not “here are 87 things”
- grouping that is a *projection* — rebuilding it never touches the commitments

API: `packages/core/src/services/{today,planToday,workStreams}.ts`.
