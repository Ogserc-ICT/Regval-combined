# Start here: OGSERC combined Registry & Evaluation app

This is a new, standalone project. It shares no code, database, number series or Vercel
project with the Registration & Evaluation app or the registry app. This folder is the whole
starting point:

- `CLAUDE.md`: standing instructions Claude Code reads at the start of every session
- `docs/COMBINED_BUILD.md`: the full build brief (gaps G1 to G13, phases, acceptance checks)
- `docs/source/OGSERC_Registry_and_Evaluation_Combined.xlsm`: the workbook, which is the spec

## 1. Create the repo

Create an empty private repo in the OGSERC GitHub organisation named
`ogserc-registry-evaluation`. Don't add a README or licence, so it stays empty.

## 2. Make the folder

Make a folder called `ogserc-registry-evaluation` where you keep your projects and unzip this
kit into it, so `CLAUDE.md` sits at the top of the folder.

## 3. Put it under git and push

In a terminal (PowerShell is fine), inside the folder:

```
git init -b main
git add .
git commit -m "Start combined app: build brief and reference workbook"
git remote add origin <new-repo-url>
git push -u origin main
```

## 4. Open Claude Code in the folder

Give Claude Code this instruction:

```
Read CLAUDE.md and docs/COMBINED_BUILD.md, then inspect docs/source/OGSERC_Registry_and_Evaluation_Combined.xlsm. This is a new standalone project with no existing code. Do Phase 0 only. Stop when it is done and show me the spec and plan before writing any code.
```

## 5. Work phase by phase

Phase 0 produces `docs/SPEC.md`, `docs/PLAN.md` and `docs/QUESTIONS.md`. Read them, answer
the questions, then reply "Go to Phase 1". Repeat through Phase 6.

Phase 1 creates a new Vercel project and database for the first preview deployment. Keep them
separate from your other apps' projects and databases.
