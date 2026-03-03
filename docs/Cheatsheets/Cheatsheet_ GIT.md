# Git Cheatsheet – Enval

Deze cheatsheet beschrijft de **enige juiste Git-workflow** voor dit project.
Volg dit letterlijk → geen chaos, geen kapotte deploys.

===================================================================

## Project context
- Repo: `~/dev/enval`
- Productie-branch: `main`
- Werk-branches: `feature/*`
- Live deploy: **alleen `main`** (Netlify)

===================================================================

## 0️⃣ Altijd eerst: waar ben ik?
```bash
    cd ~/dev/enval
    pwd
    git branch --show-current
    git status
```

✔ Verwacht:

    pad eindigt op /dev/enval
    branch = wat je denkt
    status = clean of bewust dirty

===================================================================

1️⃣ Nieuwe feature starten (veilig)
    git checkout main
    git pull
    git checkout -b feature/naam

Voorbeeld:

    git checkout -b feature/pricing

===================================================================

2️⃣ Werken zonder risico

Alles wat je doet op feature/*:

- raakt productie niet
- mag breken
- mag WIP zijn

👉 Zolang je niet op main werkt, kan de site niet veranderen.

===================================================================

3️⃣ Tussentijds opslaan (WIP)

Gebruik dit vaak.
    git add -A
    git commit -m "wip: korte omschrijving"

📌 Effect:
    ❌ productie: nee
    ❌ GitHub: nee
    ✅ lokaal opgeslagen: ja

===================================================================

4️⃣ Backup maken (nog steeds niet live)

Als je werk veilig op GitHub wil hebben:
    git push -u origin feature/naam


📌 Effect:
    ❌ productie: nee
    ❌ main: nee
    ✅ GitHub backup: ja

===================================================================

5️⃣ Wisselen van branch (zonder ellende)

Altijd eerst:
    git status

Als clean:
    git checkout main

Als niet clean → kies één:

A. Committen (aanrader):
    git add -A
    git commit -m "wip: save"


B. Tijdelijk parkeren (stash):
    git stash -u
    git checkout main


Later terughalen:
    git stash pop

===================================================================

6️⃣ Klaar → naar productie
    git push


Dan op GitHub:

1. Pull Request: feature/* → main
2. Deploy Preview checken
3. Merge
4. Na merge lokaal opruimen:
    git checkout main
    git pull
    git branch -d feature/naam

===================================================================

7️⃣ Paniek? Altijd dit:
    git status
    git branch --show-current

90% van Git-problemen wordt hier opgelost.

===================================================================

🚫 NOOIT doen

    ❌ werken buiten /dev/enval
    ❌ direct werken op main
    ❌ mapjes kopiëren “voor de zekerheid”
    ❌ branch switchen met oncommitted chaos

🧠 Onthouden (1 zin)

    Commit = opslaan
    Push = backup
    Merge naar main = live


===================================================================

## 🔒 Optioneel (maar slim)
Je kunt dit bestand **wel committen**:

```bash
git add .git-cheatsheet.md
git commit -m "docs: add git cheatsheet"
git push


Dit verandert niets aan je site, maar helpt Future-You enorm.


