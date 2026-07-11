# Classmate Agent

Windows-first AI classroom agent with WASAPI loopback capture, local or cloud transcription,
evidence-backed semantic extraction, a knowledge graph, hybrid retrieval, live notes, tasks,
ten-day reports, and Word/PDF export.

## Quick start

1. Install Node.js 20+, Python 3.11+, .NET 8 SDK, FFmpeg, and Ollama.
2. Copy `.env.example` to `.env` and adjust local model names.
3. Run `npm install` and `npm run db:migrate`.
4. Install Python dependencies: `python -m pip install -r services/ai-worker/requirements.txt`.
5. Build helpers: `dotnet build tools/audio-capture -c Release` and `dotnet build tools/report-export -c Release`.
6. Start with `npm run dev`.

The API listens on loopback only. Secrets remain in the server process and are never exposed to
the Electron renderer.

