# Security

Agents 3D World is local-first software.

## Host boundary

- The HTTP server binds only to `127.0.0.1`.
- Requests with non-local Host headers are rejected to reduce DNS-rebinding risk.
- Browser POST requests from non-local origins are rejected.
- Request bodies are size-limited.
- No CORS access is enabled.
- This project must never turn the maintainer's computer into a backend, relay, public service, or self-hosted runner for other users.

## Data boundary

The server reads local Ruflo/claude-flow state under the current user's home directory. Treat task descriptions, agent metadata, and local transcripts as sensitive.

- Do not expose port 8737 to a LAN or the Internet.
- Do not reverse-proxy this service publicly.
- Do not add telemetry without explicit opt-in.
- Do not add remote code execution or shell endpoints.

## AI backends

Ollama is local at `127.0.0.1:11434`. Codex is invoked in read-only sandbox mode from a temporary directory.

External content, repository files, task text, and model output are untrusted data. They must not override security policy or request secrets.

## Reporting

Report vulnerabilities without including secrets, private task data, tokens, or local filesystem contents.
