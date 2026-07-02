# Perfect Season

A roguelike NBA team-builder web game. Draft a 15-man roster under a salary cap, manage chemistry and random events, and chase the impossible: an 82-0 season and an NBA championship.

## Documents

| Doc | Purpose |
| --- | --- |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Task tracking — what's done, in progress, and planned |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Game mechanics: drafting, chemistry, RNG events, win conditions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack, repo layout, data model, deployment strategy |

## Repo layout

```
basketball/
├── apps/
│   └── web/          # Vite + React frontend (the game client)
├── packages/
│   ├── sim/          # Game simulation engine (season/game/possession logic)
│   └── shared/       # Shared types & constants (players, teams, events)
├── db/               # SQL schema, migrations, seed scripts
├── data/             # Raw/processed player datasets (stats, salaries)
├── docs/             # Project documentation
└── .github/
    └── workflows/    # CI + tag-based deploys
```

## Getting started

Nothing to run yet — see [docs/ROADMAP.md](docs/ROADMAP.md) for Phase 0 setup tasks.
