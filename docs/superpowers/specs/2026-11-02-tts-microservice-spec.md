# Spec: Decoupling ZeroTTS into a Standalone FastAPI Microservice with In-Memory Base64 Audio Delivery

**Status:** ready-for-agent  
**Date:** 2026-11-02  
**Context:** Chùa Online TikTok Live  
**Related Documents:** [GLOSSARY.md](../../GLOSSARY.md), [docs/adr/0001-tts-microservice-architecture.md](../adr/0001-tts-microservice-architecture.md)

---

## Problem Statement

As a live stream host running the interactive spiritual live platform on Windows and cross-platform environments (Linux VPS, macOS, Docker), the system crashes frequently because the text-to-speech engine runs as a tightly coupled child process spawned directly from the core web server. 

Specifically:
1. When downloading and caching deep learning models on Windows, cross-directory symbolic links in Hugging Face cache trigger path security errors in the neural network runtime, causing the background voice synthesizer to abruptly abort.
2. Because the voice synthesizer process is bound directly to the main server via standard input/output pipes, any exit immediately forces an aggressive automatic restart loop, spamming logs and destabilizing the system.
3. The server constantly writes temporary `.wav` audio files to disk, creating heavy disk I/O, file locking issues, and accumulation of junk cache files.
4. If the speech engine fails or takes time to warm up its weights, it threatens to disrupt ongoing live stream connections, spectator interactions, and visual animations.

---

## Solution

Decouple the voice synthesis engine from the main web server by turning it into an independent, lightweight HTTP REST microservice built on FastAPI.

1. **Separation of Concerns:** The main web server (acting as the Live Gateway) and the speech engine (the TTS Service) run as distinct services. The Live Gateway communicates with the TTS Service through standard HTTP requests (`/synthesize`, `/health`, `/voices`).
2. **Direct In-Memory Audio Delivery (Zero Disk Footprint):** The TTS Service synthesizes audio purely in memory, encodes the raw waveform into a Base64 Data URI, and returns it directly in the HTTP JSON response. The Live Gateway forwards this payload via WebSocket to the live screen client (OBS), where the browser plays it directly in RAM without saving any files to disk.
3. **Sequential Concurrency Guard:** The TTS Service uses an internal inference lock so simultaneous speech requests are handled one at a time, protecting processor resources from spiking and preventing audio jitter.
4. **Soft Dependency with Auto-Recovery:** The Live Gateway treats the TTS Service as a non-blocking dependency. If the TTS Service is offline or loading, live stream chat, 3D temple visuals, and merit tracking continue uninterrupted; the gateway automatically polls for service readiness and resumes voice playback the moment the service is healthy.
5. **Universal Portability:** The solution provides both Docker Compose orchestration for server deployments and simple concurrent runner scripts for local development.

---

## User Stories

1. As a live stream host, I want the live stream screen and 3D temple animations to remain responsive even if the TTS engine is still starting up or restarting, so that viewers never see the live room freeze or crash.
2. As a live stream host, I want all ritual notifications (bell ringing, incense burning, fortune telling) to be spoken aloud in a natural Vietnamese voice, so that donors feel recognized and spiritually engaged.
3. As a live stream viewer, I want my personalized prayer and merit dedication to be read aloud immediately without stuttering, even when many other viewers are commenting simultaneously.
4. As a system operator, I want the system to operate with zero disk cache for audio files, so that server storage does not fill up over hours of continuous live broadcasting.
5. As a system operator, I want the speech synthesis service to expose a dedicated health check endpoint, so that orchestration tools (Docker, Kubernetes, or the Live Gateway) can verify readiness before routing requests.
6. As a system operator, I want to deploy both the gateway and the speech service with a single command via Docker Compose on any Linux VPS with CPU or GPU, so that environment setup is repeatable and clean.
7. As a developer, I want to run and test the gateway and speech service locally without needing Docker, so that my local code-test-debug cycle remains fast and lightweight on Windows or macOS.
8. As a developer, I want the TTS Service to expose an interactive API documentation interface (Swagger UI), so that I can easily test voice synthesis for custom text without triggering a full live stream event.
9. As a developer, I want the TTS Service to have its own isolated dependencies and container specification, so that heavy machine learning libraries do not pollute the gateway codebase.
10. As a live stream host, I want the Admin Panel to display the real-time operational status (online, loading, or offline) of the TTS Service, so that I have clear visibility into whether voice playback is active.
11. As a live stream viewer, I want foreign symbols, emojis, and spam characters in my comment to be sanitized cleanly before speech synthesis, so that the voice does not glitch or crash mid-sentence.
12. As a live stream host, I want the gateway to automatically reconnect and resume voice playback as soon as the TTS Service comes back online, without requiring a manual restart of the gateway.

---

## Implementation Decisions

### 1. Module Boundaries & Roles
- **Live Gateway (Node.js):** Acts as the central orchestrator and client gateway. Responsible for TikTok Live event ingestion, Ritual Orchestrator logic, WebSocket state broadcasting, and serving public web assets. It communicates with the TTS Service strictly via outbound HTTP calls.
- **TTS Service (Python / FastAPI):** An isolated microservice responsible exclusively for text sanitization, ZeroTTS model inference, waveform audio polishing, and Base64 WAV serialization.

### 2. API Contracts & Interfaces
- **`POST /synthesize`**:
  - Request: `{ "text": string, "voice"?: string }`
  - Response: `{ "ok": true, "audio": "data:audio/wav;base64,...", "durationSec": number, "voice": string }`
  - Error Response: `{ "ok": false, "error": string }` with appropriate HTTP status codes (400 for empty/invalid text, 503 for model still loading, 500 for inference failure).
- **`GET /health`**:
  - Response: `{ "status": "loading" | "ready" | "error", "voices": string[], "model": string, "sampleRate": number, "uptimeSec": number }`
- **`GET /voices`**:
  - Response: `{ "default": "maichi", "voices": ["maichi", "baotrang", "giahuy", ...] }`

### 3. Audio Delivery Mechanism
- Audio is rendered directly into an in-memory buffer as a 48kHz WAV container.
- The byte buffer is converted to a base64 string formatted as a standard Data URI (`data:audio/wav;base64,...`).
- The Live Gateway transmits this Data URI directly to connected clients over the existing WebSocket notification event (`tts.play`).
- The client browser plays the sound in-memory using the standard HTML5 Audio constructor (`new Audio(dataUri)`), completely bypassing disk storage and file serving endpoints.

### 4. Concurrency & Resource Guard
- The TTS Service encapsulates inference execution within an asynchronous lock (`asyncio.Lock`).
- If multiple synthesis requests arrive concurrently, they wait in the asynchronous queue and are evaluated sequentially, ensuring predictable memory usage and preventing CPU thread contention.

### 5. Gateway Resilience & Soft Dependency
- The Live Gateway polls `GET /health` upon startup and at periodic intervals (e.g., every 3-5 seconds while unready, 15 seconds once healthy).
- When synthesis is requested:
  - If the TTS Service is ready, the gateway awaits the synthesis result up to a timeout threshold (e.g., 6 seconds) and broadcasts the audio.
  - If the service is offline or timed out, the gateway logs a non-fatal warning, marks the TTS health status as degraded, and continues broadcasting the ritual's visual state to OBS without error.

### 6. Code Organization & Packaging
- The TTS Service is housed in its own dedicated directory (`services/tts/`), containing its application entrypoint, requirement specifications, model loader utilities, and Dockerfile.
- A project-level Docker Compose file defines both the `live-gateway` and `tts-service` services with health checks and network linkage.
- The existing legacy worker script is archived as `tts_worker.py.bak` for backward reference.

---

## Testing Decisions

### What Makes a Good Test
Tests must verify externally observable behavior at service seams rather than internal implementation details:
- For the TTS Service: Sending an HTTP synthesis request returns a valid 200 response with a decodable WAV Base64 payload, correct headers, and accurate duration metadata.
- For the Live Gateway: Requesting speech synthesis via JSON-RPC emits a WebSocket broadcast containing the audio Data URI, and service unavailability does not cause the gateway or ritual execution to crash.

### Testing Seams
1. **Seam A (TTS Service HTTP Seam - Highest for TTS):**
   - Driven by: HTTP POST `/synthesize` and GET `/health` against the FastAPI service.
   - Observed by: HTTP status codes and valid JSON schemas containing decodable RIFF WAV headers.
2. **Seam B (Live Gateway RPC-to-WebSocket Seam - Highest End-to-End):**
   - Driven by: Invoking `temple.speak` or ritual commands on the Live Gateway HTTP RPC interface.
   - Observed by: Receiving the `tts.play` event on an open WebSocket client and checking the audio payload format.
3. **Seam C (Fault Tolerance Seam):**
   - Driven by: Calling speech synthesis when the TTS Service endpoint is down.
   - Observed by: The gateway returns `{ ok: false, error: ... }` cleanly without throwing unhandled exceptions, and subsequent ritual commands complete their visual transitions.

### Prior Art
- Existing ritual execution tests in the Live Gateway.
- Standalone execution tests developed during diagnostic verification of ZeroTTS model loading.

---

## Out of Scope

1. **Token-by-Token Audio Streaming:** Streaming micro-chunks of raw PCM audio over WebSockets as words are generated (not needed since ZeroTTS synthesizes entire sentences).
2. **Cloud Speech API Integration:** Fallback to Google Cloud TTS or Edge-TTS (current focus is entirely on local private ZeroTTS execution).
3. **Multi-Instance Load Balancing:** Running multiple replicas of the TTS Service behind an Nginx reverse proxy (a single local instance with an asynchronous lock is sufficient for the single-stream live room).
4. **Modifying Frontend Visuals:** Changes to the 3D temple scene, particle effects, or OBS stage layout.

---

## Further Notes

- **Model Placement:** The TTS Service will search for weights in `ZEROTTS_MODEL_PATH`, `models/zerotts/`, and `~/.cache/zerotts-local`. On fresh environments, it uses `snapshot_download` with `local_dir` to ensure genuine local files with no symlink traversal issues.
- **WebSocket Payload Size:** A typical 3-5 second speech clip yields approximately 200KB-400KB in Base64 encoding. Over a local WebSocket connection (`localhost` to OBS), transfer latency is sub-millisecond, which is negligible compared to synthesis time.
