#!/usr/bin/env python3
"""Local server for the Ruflo 3D world.

Reads live state from every .claude-flow directory under the home folder
(each project's swarm/task/daemon state) and serves it as JSON to the
Three.js frontend, plus static files. No network calls, no external deps.
"""
import json
import glob
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOME = os.path.expanduser("~")
ROOT = os.path.dirname(os.path.abspath(__file__))

# Cute, saturated palette per team — assigned deterministically by name hash
PALETTE = [
    "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#38d9a9",
    "#4dabf7", "#748ffc", "#da77f2", "#f783ac", "#ff8787",
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


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep console quiet

    def _send_json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
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
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/state":
            self._send_json(build_state())
        elif path == "/" or path == "/index.html":
            self._send_file("index.html", "text/html; charset=utf-8")
        elif path == "/world.js":
            self._send_file("world.js", "application/javascript; charset=utf-8")
        elif path == "/vendor/three.min.js":
            self._send_file("vendor/three.min.js", "application/javascript; charset=utf-8")
        elif path == "/vendor/OrbitControls.js":
            self._send_file("vendor/OrbitControls.js", "application/javascript; charset=utf-8")
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
