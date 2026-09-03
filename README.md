# 🌈 Agents 3D World

A cute, colorful, real-time 3D view of your [Ruflo / claude-flow](https://github.com/ruvnet/claude-flow) agents, swarms, and tasks — running entirely on your own machine.

Each project shows up as a floating island, agents and tasks show up as little kawaii creatures colored by status (waiting, working, done, failed), and a central "core" island shows your background daemon workers. Orbit the camera to look at it from any angle, and drag any creature or island around with your mouse.

**100% local. No account, no cloud, no telemetry.** It's a tiny Python server that reads the JSON state files claude-flow already writes to disk (`~/.claude-flow`, and any `*/.claude-flow` in your projects) and a browser page (three.js) that polls it every couple seconds. Nothing ever leaves your computer, and running someone else's copy of this never gives them access to yours — it only ever reads the machine it's running on.

## Requirements

- Python 3.8+ (standard library only, no pip installs)
- A browser (Chrome, Safari, Firefox, Edge)
- Optional: [claude-flow / ruflo](https://github.com/ruvnet/claude-flow) actually running, so there's something to look at. Without it, you still get the empty world with its sleepy core mascot.

## Run it

```bash
python3 server.py
```

Then open **http://127.0.0.1:8737**

Or use the launcher for your OS:

- macOS/Linux: `./start.sh`
- Windows: double-click `start.bat`

## Talk to a worker

Click any worker to open a chat panel. By default it answers from the real data only (no AI, no cost). If you have [Ollama](https://ollama.com) running locally and/or the [Codex CLI](https://github.com/openai/codex) signed in, they show up in the 🧠 dropdown and you get real, in-character replies grounded in that worker's actual task/status/progress — it's told never to invent work, and to be honest that it can't yet execute real commands. Nothing is sent anywhere except your own local Ollama daemon or your own already-authenticated Codex CLI.

## Controls

- **Drag on empty space** — orbit the camera (see the world from any angle)
- **Scroll** — zoom
- **Drag a creature or island** — move it; your layout is remembered (saved in your browser's local storage)
- **Hover a creature** — see what it's working on

## Auto-start on login (optional)

- **macOS**: `./scripts/install-autostart-macos.sh` — installs a LaunchAgent that starts the server and opens the page every time you log in. Remove it with the `launchctl unload` commands the script prints.
- **Windows**: right-click `scripts/install-autostart-windows.ps1` → *Run with PowerShell* — adds a shortcut to your Startup folder. Remove it by deleting that shortcut.

## How classification works

- Every folder with a `.claude-flow` directory becomes its own island, named after the project folder.
- Tasks from the global `~/.claude-flow` store get sorted onto an island by their first tag, so tagged work (e.g. `"tags": ["my-project", ...]`) lands in the right place even if it wasn't run from inside that project folder.
- The central island shows the claude-flow background daemon and its workers (map, audit, optimize, consolidate, test-gap scan, etc).

## License

MIT — see [LICENSE](LICENSE). Take it, fork it, make your own agents cuter.
