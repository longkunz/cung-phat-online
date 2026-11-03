# Spec: High-Concurrency Interaction Guard, LIKE Stream Batching, and RPC Debouncing for Live Gateway & 3D Sanctuary

**Status:** ready-for-agent  
**Date:** 2026-11-02  
**Context:** Chùa Thiên Mụ TikTok Live — Interactive Buddhist Sanctuary  
**Related Documents:** [GLOSSARY.md](../../GLOSSARY.md), [docs/adr/0001-tts-microservice-architecture.md](../adr/0001-tts-microservice-architecture.md), [docs/superpowers/specs/2026-10-31-tiktok-live-temple-rpc-design.md](2026-10-31-tiktok-live-temple-rpc-design.md)

---

## Problem Statement

During high-profile TikTok Live broadcasts or viral peak traffic periods, hundreds or thousands of concurrent viewers interact with the Chùa Thiên Mụ sanctuary at the same time. Viewers send rapid bursts of screen taps (thousands of likes per minute), spam interactive commands or web dock buttons, and trigger simultaneous ritual requests.

Currently, while the text chat parser applies a 3.5-second cooldown to comments and visual animations use token bucket limits, three critical bottlenecks remain exposed under burst traffic:

1. **WebSocket Flooding from Rapid LIKE Events:** Each incoming TikTok like packet immediately executes a wooden fish strike ritual and triggers a full public state broadcast containing the entire leaderboard, recent events list, and devotee roster over WebSocket. During tap storms (30–50 packets per second), the JSON serialization and broadcast saturation creates severe event loop congestion and frame drops on client renderers.
2. **Unregulated Ritual RPC Invocations:** The user cooldown currently exists solely within the chat comment parser (`parseViewerComment`). Direct JSON-RPC ritual calls (`temple.burnIncense`, `temple.strikeWoodenFish`, `temple.ringBell`, `temple.drawFortune`) lack caller cooldown guards, allowing an automated script or aggressive web user to execute dozens of rituals per second, skewing merit tallies and bloating memory with rapid event records.
3. **Lack of Frontend Interaction Debouncing:** Devotees clicking ritual buttons in the 3D sanctuary quick dock can inadvertently double-click or spam buttons, firing redundant concurrent RPC calls before the first call finishes.

The system requires an end-to-end high-concurrency interaction guard that batches high-frequency like streams, enforces uniform ritual cooldowns across all entry points, and provides client-side interaction debouncing without degrading responsiveness or visual feedback.

---

## Solution

Implement a comprehensive three-tier concurrency guard across the Live Gateway and Chánh Điện 3D client:

1. **Temporal LIKE Stream Accumulator (Micro-Batching):** Instead of processing and broadcasting every like packet immediately, the Live Gateway aggregates incoming likes into a sliding micro-batch window (250ms–350ms). When the timer expires, a single consolidated wooden fish strike event is published with the accumulated count, updating merit in a single pass and emitting at most 3 to 4 WebSocket state synchronization frames per second regardless of tap intensity.
2. **Unified Caller Cooldown Guard in Ritual Orchestrator:** Introduce a centralized cooldown gatekeeper at the Live Gateway ritual execution boundary. Every ritual invocation—whether originating from TikTok chat commands, direct JSON-RPC HTTP requests, or WebSocket RPC messages—must pass an identity-keyed sliding cooldown (e.g., 1.5s for standard rituals, 3.5s for fortune drawing and bell ringing). Rapid duplicate calls return a non-fatal, clear cooldown response with remaining wait time.
3. **Client-Side Quick Dock Debounce & Optimistic Interaction Feedback:** Equip the 3D sanctuary quick dock buttons with an immediate transient lock (350ms–500ms). Upon click, the button presents visual pressed feedback while ignoring duplicate clicks until the micro-cooldown elapses, preventing accidental double-invocations at the user interface seam.

---

## User Stories

1. As a live stream viewer, I want my taps and likes on TikTok Live to be counted faithfully toward temple merit, so that my devotional effort is recognized without crashing the stream.
2. As a live stream viewer, I want the wooden fish sound to ring out crisply and harmoniously during tap storms, so that the audio sounds natural rather than creating a deafening audio buzz or stutter.
3. As a live stream host running OBS, I want the 3D sanctuary to maintain a steady 30 FPS even during massive like raids, so that the broadcast never freezes, drops frames, or disconnects.
4. As a live stream host, I want incoming like streams to be batched into smooth aggregate pulses, so that network bandwidth between the Live Gateway and OBS remains stable and predictable.
5. As a web devotee visiting the sanctuary on the web, I want clicking the incense or prayer button to give immediate tactile feedback, so that I know my offering was registered.
6. As a web devotee, I want accidental double-clicks on the ritual buttons to be ignored gracefully, so that I do not accidentally submit duplicate offerings or spam the Chánh Điện.
7. As a web devotee who clicks a button during an active cooldown, I want to see a gentle countdown or indicator, so that I understand when I can perform my next ritual.
8. As a community moderator, I want abusive scripts or bots attempting to spam ritual RPC endpoints to be automatically throttled, so that the merit leaderboard remains fair and trustworthy.
9. As a developer, I want all ritual cooldowns to be evaluated centrally in the Ritual Orchestrator, so that future interfaces (Discord bots, TikTok connectors, web apps) automatically inherit anti-spam protection.
10. As a developer, I want the LIKE accumulator to flush any pending likes immediately when a stream ends or disconnects, so that zero merit points are lost during shutdown.
11. As a live stream viewer performing a sacred fortune draw, I want a mandatory cooldown between draws, so that the fortune oracle retains its spiritual weight and cannot be spammed.
12. As a live stream viewer donating a special gift (e.g., golden lotus, dragon ceremony), I want my gift ritual to bypass standard rate-limiting queues, so that major temple contributions are never dropped or rejected.
13. As a live stream host, I want the memory footprint of rate-limiting trackers to be strictly bounded with LRU eviction, so that long-running 24/7 streams never suffer memory leaks.
14. As a developer, I want RPC throttling errors to return well-structured JSON-RPC error codes rather than 500 server crashes, so that clients can handle throttles gracefully.
15. As a live stream viewer, I want the event feed on screen to stay readable and elegant during high-traffic moments, so that text notices do not fly by too fast to read.
16. As a live stream host, I want the state broadcast rate during tap storms to be capped at a maximum frequency (e.g., 3 Hz), so that downstream WebSocket consumers are not overwhelmed.
17. As a developer, I want the micro-batch window to dynamically scale down during quiet periods (processing single likes instantly) and scale into batching during surges, so that responsiveness feels immediate when traffic is low.
18. As a live stream viewer, I want my merit count and rank to reflect the combined sum of my rapid likes accurately, so that batching never truncates or underestimates my contributions.
19. As a web devotee, I want the quick dock buttons to disable briefly during their transit lock, so that rapid tapping does not cause visual glitching on the dock icons.
20. As a developer, I want tests to verify that 100 rapid concurrent RPC calls from the same unique ID produce exactly one accepted ritual and 99 rate-limited responses, so that regression risks are eliminated.
21. As a developer, I want tests to prove that like batching collapses multiple sequential packets into a single broadcasted event containing the correct summed merit, so that auditability is guaranteed.
22. As a live stream viewer, I want bell ringing rituals to have an extended cooldown corresponding to the bell's resonance duration, so that bell chimes do not clip or sound cacophonous.

---

## Implementation Decisions

### 1. Module Boundaries & Placement
- **Live Gateway & Ritual Orchestrator Boundary:**
  - The rate-limiting gatekeeper resides directly within the ritual execution pipeline before any state modification or event log creation.
  - The LIKE stream accumulator resides between the streaming platform connector and the Ritual Orchestrator, buffering high-frequency tap events before dispatching them as batched ritual actions.
- **Client Presentation Boundary:**
  - Client-side debouncing resides in the quick dock controller of the 3D sanctuary frontend, providing visual and functional click dampening without altering server authority.

### 2. LIKE Stream Accumulator Architecture (Micro-Batching)
- **Window Duration:** A sliding timer of 300ms window duration.
- **Aggregation Logic:** Incoming like packets within the window aggregate:
  - Total like counts summed.
  - Devotee identity associated with the most active contributor in the window (or a consolidated congregation label if multiple users contributed).
  - Single event log appended and single state broadcast triggered at the end of the window.
- **Zero-Drop Flush Guarantee:** On stream disconnection, shutdown, or manual flush, any active batch timers immediately discharge their accumulated counts.

### 3. Centralized Ritual Cooldown Gatekeeper
- **Identity Keying:** Rate limits are keyed on `devoteeKey` (derived from `uniqueId` or sanitized user name, with fallback to remote IP for anonymous web guests).
- **Tiered Cooldown Policies:**
  - `strikeWoodenFish`: 250ms minimum interval per user (or absorbed by the like accumulator).
  - `burnIncense`: 2000ms cooldown per user.
  - `sendPrayer` / `lantern`: 2000ms cooldown per user.
  - `ringBell`: 3000ms cooldown per user (respecting acoustic resonance).
  - `drawFortune`: 4000ms cooldown per user.
  - `offerGift` / `grandCeremony`: Exempt from rate limits (monetary offerings are always honored).
- **Storage & Eviction:** In-memory LRU map capped at 1,000 active keys with automatic expiration cleanup, consuming negligible RAM.

### 4. Client Quick Dock Interaction Debounce
- **Visual Transit Lock:** Buttons apply a transient CSS class (`button-cooldown`) for 400ms after invocation, dampening pointer events and restoring active state smoothly upon timer completion.
- **Non-Blocking UI:** The client remains fully responsive to camera panning, audio adjustments, and navigation while individual ritual action buttons recover.

---

## Testing Decisions

### 1. Behavior-Driven Testing Principles
- Tests must exclusively evaluate observable external behaviors: HTTP/RPC status codes, emitted WebSocket broadcast payloads, accumulated merit totals, and elapsed time intervals.
- Tests must never inspect internal timer IDs, private variable references, or arbitrary implementation artifacts.

### 2. Modules to Test
- **Live Gateway Ritual Invocations:** Direct JSON-RPC execution under concurrent call floods.
- **LIKE Stream Accumulator:** Rapid batching of streaming tap packets and merit calculation integrity.
- **Client Dock Controller:** Visual class application and duplicate call suppression under programmatic click bursts.

### 3. Prior Art in Codebase
- `tests/gateway_tts.test.js`: Demonstrates clean HTTP/WebSocket mocking, timeout guards, and external contract verification for the Live Gateway.
- `tests/crowd_navigation.test.js`: Demonstrates deterministic multi-agent step testing and spatial bounds assertion.

---

## Out of Scope

- Distributed Redis rate limiting (single-instance memory cache is sufficient for the current Bun.js architecture).
- CAPTCHA or proof-of-work challenges for web visitors (handled natively by streaming platforms or Cloudflare Turnstile if needed in the future).
- Complex IP geolocation blacklisting (handled at the reverse proxy / firewall level).

---

## Further Notes

- The micro-batching mechanism ensures that even if TikTok Live delivers thousands of like taps within seconds during featured moments, the Chánh Điện 3D renderer receives smooth, rhythmic pulses that resemble mindful temple practice rather than a chaotic software glitch.
- The 250ms–350ms window was chosen based on human perception thresholds: users perceive events within 300ms as virtually real-time, yet 300ms reduces 50 packet broadcasts down to at most 3 WebSocket broadcasts per second.
