#!/usr/bin/env python3
"""Local server for the Ruflo 3D world.

Reads live state from every .claude-flow directory under the home folder
(each project's swarm/task/daemon state) and serves it as JSON to the
Three.js frontend, plus static files. No network calls, no external deps.
"""
import json
import glob
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOME = os.path.expanduser("~")
ROOT = os.path.dirname(os.path.abspath(__file__))
OLLAMA_URL = "http://127.0.0.1:11434"


def find_codex_bin():
    found = shutil.which("codex")
    if found:
        return found
    # launchd/cron run with a minimal PATH that skips npm/homebrew bin dirs
    for candidate in (
        os.path.join(HOME, ".npm-global/bin/codex"),
        "/usr/local/bin/codex",
        "/opt/homebrew/bin/codex",
    ):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


CODEX_BIN = find_codex_bin()

# launchd/cron give this process a minimal PATH (no /usr/local/bin, no npm
# global bin) — codex needs `node` on PATH even when we call its absolute
# path, so make sure the usual spots are there for any subprocess we spawn.
for _extra in ("/usr/local/bin", "/opt/homebrew/bin", os.path.join(HOME, ".npm-global/bin")):
    if _extra not in os.environ.get("PATH", "").split(":"):
        os.environ["PATH"] = os.environ.get("PATH", "") + ":" + _extra

# Cute, saturated palette per team — assigned deterministically by name hash
PALETTE = [
    "#c96b4f", "#c08a4e", "#d9a441", "#7a9b5e", "#5c8a78",
    "#5b7a8c", "#6f7a9e", "#8f6d97", "#a8445a", "#b06a5a",
]


def color_for(name: str) -> str:
    h = sum(ord(c) for c in name)
    return PALETTE[h % len(PALETTE)]


def safe_read_json(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return None


def find_claude_flow_dirs():
    dirs = set()
    for path in glob.glob(os.path.join(HOME, "*/.claude-flow")):
        if os.path.isdir(path):
            dirs.add(path)
    for path in glob.glob(os.path.join(HOME, "*/*/.claude-flow")):
        if os.path.isdir(path):
            dirs.add(path)
    top = os.path.join(HOME, ".claude-flow")
    if os.path.isdir(top):
        dirs.add(top)
    return sorted(dirs)


AGENT_TYPE_ICON = {
    "coder": "🔧", "coordinator": "🧭", "researcher": "🔍", "reviewer": "🧐",
    "tester": "🧪", "architect": "📐", "analyst": "📊", "planner": "🗺️",
    "backend-dev": "🔧", "frontend-dev": "🎨", "security": "🛡️",
    "documenter": "📝", "optimizer": "⚡", "default": "🐣",
}


def team_name_from_dir(cf_dir):
    project_dir = os.path.dirname(cf_dir)
    name = os.path.basename(project_dir)
    if name in (".", "", HOME.split("/")[-1]):
        name = "home"
    return name


def get_bucket(teams, name):
    return teams.setdefault(name, {
        "name": name,
        "color": color_for(name),
        "agents": [],
        "tasks": [],
        "daemon": None,
    })


def build_state():
    teams = {}
    now = time.time()

    for cf_dir in find_claude_flow_dirs():
        team = team_name_from_dir(cf_dir)
        is_global_store = team == "home"
        bucket = get_bucket(teams, team)

        swarm_state = safe_read_json(os.path.join(cf_dir, "swarm", "swarm-state.json"))
        if swarm_state:
            for swarm_id, swarm in swarm_state.get("swarms", {}).items():
                for agent in swarm.get("agents", []) or []:
                    bucket["agents"].append({
                        "id": agent.get("id", swarm_id),
                        "type": agent.get("type", "default"),
                        "icon": AGENT_TYPE_ICON.get(agent.get("type", "default"), AGENT_TYPE_ICON["default"]),
                        "status": agent.get("status", "idle"),
                        "task": agent.get("currentTask") or agent.get("task") or "",
                        "swarmId": swarm_id,
                        "swarmStatus": swarm.get("status", "unknown"),
                        "topology": swarm.get("topology", ""),
                    })
                if swarm.get("status") not in ("terminated",) and not swarm.get("agents"):
                    bucket["swarm_meta"] = {
                        "id": swarm_id,
                        "status": swarm.get("status"),
                        "topology": swarm.get("topology"),
                    }

        agents_dir = os.path.join(cf_dir, "agents")
        if os.path.isdir(agents_dir):
            for fname in os.listdir(agents_dir):
                if fname.endswith(".json"):
                    data = safe_read_json(os.path.join(agents_dir, fname))
                    if data:
                        bucket["agents"].append({
                            "id": data.get("id", fname),
                            "type": data.get("type", "default"),
                            "icon": AGENT_TYPE_ICON.get(data.get("type", "default"), AGENT_TYPE_ICON["default"]),
                            "status": data.get("status", "idle"),
                            "task": data.get("currentTask") or data.get("task") or "",
                        })

        tasks_store = safe_read_json(os.path.join(cf_dir, "tasks", "store.json"))
        if tasks_store:
            for task_id, task in tasks_store.get("tasks", {}).items():
                status = task.get("status", "pending")
                task_entry = {
                    "id": task_id,
                    "description": task.get("description", ""),
                    "status": status,
                    "priority": task.get("priority", "normal"),
                    "progress": task.get("progress", 0),
                    "tags": task.get("tags", []),
                    "assignedTo": task.get("assignedTo", []),
                }
                # the top-level ~/.claude-flow store isn't one project —
                # classify its tasks by their own tag so they land on the
                # right island instead of piling into a generic bucket.
                target = bucket
                if is_global_store and task.get("tags"):
                    target = get_bucket(teams, task["tags"][0])
                target["tasks"].append(task_entry)

        daemon_state = safe_read_json(os.path.join(cf_dir, "daemon-state.json"))
        if daemon_state:
            workers = daemon_state.get("workers", {})
            bucket["daemon"] = {
                "running": daemon_state.get("running", False),
                "workers": [
                    {
                        "name": wname,
                        "isRunning": w.get("isRunning", False),
                        "runCount": w.get("runCount", 0),
                        "lastRun": w.get("lastRun"),
                    }
                    for wname, w in workers.items()
                ],
            }

    # drop empty islands (a project dir with a .claude-flow but nothing in it)
    teams = {
        k: v for k, v in teams.items()
        if v["agents"] or v["tasks"] or v.get("swarm_meta") or v.get("daemon")
    }

    return {
        "generatedAt": now,
        "teams": list(teams.values()),
    }


# ---------------------------------------------------------------------------
# Chat backends — Ollama (local, free) and Codex CLI (uses your ChatGPT login).
# Both are optional: the frontend falls back to fact-only answers if neither
# is available or a call fails. Nothing here talks to any server except your
# own machine's Ollama daemon, or the codex binary you already have signed in.
# ---------------------------------------------------------------------------

def list_ollama_models():
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=2) as r:
            data = json.load(r)
        return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


def backends_info():
    return {
        "ollama": {"available": bool(list_ollama_models()), "models": list_ollama_models()},
        "codex": {"available": bool(CODEX_BIN)},
    }


def build_grounding_prompt(worker, message):
    facts = [
        f"team: {worker.get('team', 'unknown')}",
        f"role: {worker.get('role', 'worker')}",
        f"current task: {worker.get('task') or 'none assigned'}",
        f"status: {worker.get('status', 'unknown')}",
    ]
    if worker.get("progress") is not None:
        facts.append(f"progress: {worker['progress']}%")
    if worker.get("priority"):
        facts.append(f"priority: {worker['priority']}")
    if worker.get("tags"):
        facts.append(f"tags: {', '.join(worker['tags'])}")
    return (
        "You are role-playing as a friendly little office-robot character in a 3D "
        "visualization of a real task-tracking system (Ruflo/claude-flow). Stay fully "
        "in character, be warm and brief (1-3 short sentences). Answer ONLY using the "
        "facts below — never invent extra work, deadlines, or people. You cannot "
        "actually execute commands or change anything real; if asked to do something "
        "(pause, start, reprioritize, etc.) say so honestly, in character.\n\n"
        "FACTS:\n" + "\n".join(f"- {f}" for f in facts) +
        f"\n\nThe user asks: \"{message}\"\n\nReply as the character, in plain text, no markdown."
    )


def call_ollama(model, worker, message):
    prompt = build_grounding_prompt(worker, message)
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat", data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    return data.get("message", {}).get("content", "").strip()


def call_codex(worker, message):
    if not CODEX_BIN:
        raise RuntimeError("codex CLI not found")
    prompt = build_grounding_prompt(worker, message)
    with tempfile.TemporaryDirectory() as tmp:
        out_file = os.path.join(tmp, "reply.txt")
        subprocess.run(
            [
                CODEX_BIN, "exec",
                "--sandbox", "read-only",
                "--skip-git-repo-check",
                "--ephemeral",
                "--output-last-message", out_file,
                prompt,
            ],
            cwd=tmp, timeout=60, capture_output=True, check=True,
        )
        if os.path.exists(out_file):
            with open(out_file, "r") as f:
                return f.read().strip()
    return ""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep console quiet

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, rel_path, content_type):
        full = os.path.join(ROOT, rel_path)
        try:
            with open(full, "rb") as f:
                body = f.read()
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/chat":
            length = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                self._send_json({"error": "bad request"}, status=400)
                return
            backend = body.get("backend", "")
            worker = body.get("worker", {})
            message = str(body.get("message", ""))[:500]
            try:
                if backend.startswith("ollama:"):
                    reply = call_ollama(backend.split(":", 1)[1], worker, message)
                elif backend == "codex":
                    reply = call_codex(worker, message)
                else:
                    self._send_json({"error": "unknown backend"}, status=400)
                    return
                self._send_json({"reply": reply or "…"})
            except Exception as e:
                self._send_json({"error": str(e)}, status=502)
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/state":
            self._send_json(build_state())
        elif path == "/api/backends":
            self._send_json(backends_info())
        elif path == "/" or path == "/index.html":
            self._send_file("index.html", "text/html; charset=utf-8")
        elif path == "/world.js":
            self._send_file("world.js", "application/javascript; charset=utf-8")
        elif path == "/vendor/three.min.js":
            self._send_file("vendor/three.min.js", "application/javascript; charset=utf-8")
        elif path == "/vendor/OrbitControls.js":
            self._send_file("vendor/OrbitControls.js", "application/javascript; charset=utf-8")
        elif (path.startswith("/assets/faces/") or path.startswith("/assets/props/")) \
                and path.count("/") == 3 and path.endswith(".png"):
            self._send_file(path.lstrip("/"), "image/png")
        elif path.startswith("/assets/textures/") and path.count("/") == 3 and path.endswith(".jpg"):
            self._send_file(path.lstrip("/"), "image/jpeg")
        else:
            self.send_response(404)
            self.end_headers()


def main():
    port = 8737
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Ruflo 3D world running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
