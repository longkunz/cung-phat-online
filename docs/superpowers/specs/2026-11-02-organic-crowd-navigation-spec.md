# Spec: Organic Crowd Navigation, Dynamic Sidestepping, and Soft Collision Avoidance for 3D Sanctuary

**Status:** ready-for-agent  
**Date:** 2026-11-02  
**Context:** Chùa Thiên Mụ TikTok Live — 3D Buddhist Sanctuary  
**Related Documents:** [GLOSSARY.md](../../GLOSSARY.md), [docs/superpowers/specs/2026-10-31-tiktok-live-temple-rpc-design.md](2026-10-31-tiktok-live-temple-rpc-design.md)

---

## Problem Statement

As a live stream viewer or host watching the interactive 3D Buddhist Sanctuary on TikTok Live, devotee avatars currently move along rigid, straight-line waypoints without reacting to other figures. When two devotees walk towards each other along the aisle, or when a devotee navigates past seated worshippers and standing crowds in the waiting area, their 3D meshes pass directly through one another like phantoms.

Conversely, enforcing rigid single-file traffic lanes (like vehicles on a divided highway) makes the temple appear sterile, robotic, and unnatural. It eliminates the vibrant, crowded, and authentic atmosphere of a traditional Asian temple where worshippers naturally mill about, pause, wait for others, and politely sidestep fellow devotees to weave through crowds.

The sanctuary needs a natural crowd simulation system that prevents visual body clipping while preserving an authentic, bustling, and dense temple atmosphere.

---

## Solution

Implement an Organic Crowd Navigation, Dynamic Sidestepping, and Soft Collision Avoidance engine in the 3D Sanctuary simulation (`public/js/temple3d.js`):

1. **Dynamic Sidestepping & Weaving:** When an avatar advances along their path and detects an oncoming or standing worshipper in their forward sensory cone, they compute a gentle lateral steering vector to weave around them toward the clearer side, rather than marching in a straight line.
2. **Contextual Pausing & Queueing ("Đứng chờ"):** When an avatar's forward corridor is congested or an obstacle is directly in front with no immediate clearance, the avatar decelerates or pauses their footsteps, patiently waiting for the corridor to open before continuing forward.
3. **Soft Physical Elasticity (Anti-Clipping Body Buffer):** Every avatar possesses an elastic body buffer zone (~0.32m radius). When devotees navigate close together or gather in crowds, soft relaxation impulses gently nudge their positions apart at the boundaries, allowing shoulder-to-shoulder clustering while strictly preventing mesh penetration.
4. **Organic Pacing & Stride Variety:** Avatars exhibit individualized walking paces (±10% variation) and subtle lateral path deviations (±15cm) so they never look like cloned robots walking in uniform synchronization.

---

## User Stories

1. As a live stream viewer, I want devotee avatars to avoid walking directly through each other's bodies, so that the spiritual sanctuary feels physically believable and immersive.
2. As a live stream viewer, I want the sanctuary to feel bustling and crowded with many worshippers, so that the temple ambiance feels warm, active, and communal.
3. As a live stream viewer, I want two devotees walking in opposite directions down the aisle to naturally steer around each other, so that they look like real people politely making way.
4. As a live stream viewer, I want a devotee walking to their seat to steer around seated worshippers, so that their robes and heads do not clip through kneeling figures.
5. As a live stream viewer, I want a devotee who is blocked by a crowded cluster of people to pause and wait for a moment, so that the movement feels patient, respectful, and human.
6. As a live stream viewer, I want devotees walking in the same direction to keep a respectful following distance, so that one avatar does not merge into the back of another.
7. As a live stream host, I want the crowd dynamics to run at a solid 30 FPS without heavy physics calculations, so that the stream host's CPU and GPU are never overloaded.
8. As a live stream host, I want avatar movement to maintain natural variety in walking speeds, so that worshippers do not look like cloned robots walking in lockstep.
9. As a live stream host, I want avatars to naturally squeeze through tight spaces between the altar and cushions, so that all sanctuary areas remain accessible during peak traffic.
10. As a live stream host, I want the main red carpet corridor to maintain a natural flow of pilgrims without gridlock, so that incense and prayer rituals are never stalled.
11. As a live stream viewer who gifted a large offering, I want my hero avatar to have priority right-of-way as they walk to the altar, so that other worshippers naturally yield and let me through.
12. As a live stream viewer, I want devotees waiting in the side areas to shuffle slightly when other worshippers join the row, so that the waiting wings feel active and alive.
13. As a live stream host, I want worshippers who are exiting the temple to smoothly weave past incoming pilgrims on the walkway, so that departures look fluid and natural.
14. As a live stream host, I want to simulate high viewer traffic with auto-simulation without avatars piling on top of each other, so that the stream looks pristine even with dozens of active participants.
15. As a live stream viewer, I want devotees' robes and bodies to gently brush past each other when navigating tight spaces, so that the crowded feel is preserved without visual glitches.
16. As a developer, I want all collision avoidance calculations to execute in a single deterministic simulation tick, so that tests can verify spatial safety without race conditions.
17. As a developer, I want the crowd avoidance algorithm to operate on 2D horizontal plane coordinates (X and Z) without 3D vertical overhead, so that performance remains lightweight.
18. As a developer, I want the avoidance steering to smoothly interpolate avatar yaw rotation, so that dodging does not cause snappy or jarring character turns.
19. As a developer, I want seated devotees on lotus cushions to be treated as static obstacles with fixed repulsion, so that walkers never traverse occupied cushions.
20. As a developer, I want the system to handle sudden avatar despawns or transitions without leaving orphan obstacle registrations, so that memory leaks and phantom collisions never occur.
21. As a live stream host, I want the visual tags (devotee names and badges) to follow their avatars smoothly during avoidance turns, so that text labels never stutter or jitter.
22. As a live stream viewer, I want worshippers standing in the waiting wings to turn towards oncoming devotees who pass nearby, so that the crowd feels attentive and aware of their surroundings.

---

## Implementation Decisions

### 1. Module Boundaries
- **3D Sanctuary Simulation Engine (`public/js/temple3d.js`):** Encapsulates the entire local crowd steering, obstacle proximity queries, sensory cones, queueing pauses, and elastic spatial relaxation.
- **Live Gateway & Ritual Orchestrator:** Fully decoupled; continue broadcasting high-level ritual events and roster updates without needing micro-level coordinate management.

### 2. Proximity & Sensory Cone Architecture
- **Horizontal 2D Plane Queries:** Steering and avoidance operate strictly on the X-Z ground plane, ignoring vertical Y axis for optimal CPU performance.
- **Sensory Probe Cone:** Each moving avatar casts a forward detection sector:
  - Detection range: $d_{\text{sense}} \approx 0.8\text{m} - 1.1\text{m}$.
  - Field of view: $\pm 35^\circ$ relative to current movement heading.
  - Detects active walking avatars, standing queue members, and occupied seating cushions.

### 3. Organic Steering & Sidestepping Vector
- When an obstacle is detected in the sensory cone:
  - A lateral steering impulse is generated perpendicular to the target vector ($\mathbf{t}_{\text{lateral}} = (-v_z, 0, v_x)$).
  - The avatar evaluates which flank (left or right) has greater clearance and blends the lateral vector into their movement velocity:
    $$\mathbf{v}_{\text{next}} = \text{normalize}\big(\mathbf{v}_{\text{target}} + w_{\text{avoid}} \cdot \mathbf{t}_{\text{lateral}}\big) \cdot s_{\text{walk}}$$
  - Yaw rotation smoothly follows $\mathbf{v}_{\text{next}}$ via spherical/angular interpolation (`lerpAngle`).

### 4. Yielding & Queueing Behavior ("Đứng chờ")
- If the forward corridor is obstructed and both lateral flanks are blocked:
  - The avatar enters a momentary yield state, throttling speed to $0.1 \times$ or pausing completely for $0.3\text{s} - 0.6\text{s}$.
  - Stride animation cadence (`a.phase`) scales proportionally with actual ground displacement, preventing foot sliding during deceleration.
  - Hero ritual performers (e.g., dâng lễ, dâng hương) receive avoidance priority; ordinary pilgrims yield to incoming hero avatars.

### 5. Soft Physical Relaxation (Anti-Clipping Elasticity)
- Every active avatar has a physical body radius $R = 0.32\text{m}$ (body diameter $0.64\text{m}$).
- In each simulation frame, after script updates, a relaxation pass checks neighbor pairs:
  $$\text{dist} = \sqrt{(x_a - x_b)^2 + (z_a - z_b)^2}$$
  $$\text{overlap} = 2R - \text{dist}$$
- If $\text{overlap} > 0$:
  - Moving avatars are displaced by $\frac{\text{overlap}}{2} \cdot \mathbf{n}_{ab}$.
  - Static avatars (seated or in deep kneeling prayer) have infinite mass and are never pushed; the moving avatar absorbs $100\%$ of the displacement.

### 6. Pacing Individuality & Natural Drift
- Each spawned avatar is assigned an intrinsic pacing seed:
  - Speed modifier: $k_{\text{speed}} \in [0.92, 1.08]$.
  - Preferred lateral offset: $\delta_x \in [-0.15\text{m}, +0.15\text{m}]$.
  - Subtle robe sway phase offset.

---

## Testing Decisions

### What Makes a Good Test
Tests must verify observable external behavioral contracts rather than internal math loops:
1. **No Clipping / Minimum Distance Guarantee:** Two avatars on intersecting or opposing paths must never overlap such that center-to-center distance drops below $0.50\text{m}$.
2. **Dynamic Evasion Verification:** An avatar approaching an obstacle must exhibit non-zero lateral displacement from their original straight line before reaching the destination.
3. **Queueing Verification:** An avatar blocked directly ahead must decelerate and complete the journey without penetrating the leader.
4. **Deterministic Convergence:** Every moving avatar must eventually reach their designated destination cushion or doorway within an acceptable time window.

### Testing Seam
- **Primary Seam: The Avatar Simulation & Spatial Behavior Seam (`Temple3D.step` / `simulate(dt)`):**
  The client 3D engine exposes `Temple3D.step(seconds, dt)` and `avatars` pool for headless, deterministic stepping. Unit/integration tests initialize two or more test avatars on collision courses, step the simulation forward, and assert spatial separation and goal arrival.

### Prior Art
- Existing test architecture in `tests/local_dev_scripts.test.js` and `tests/gateway_tts.test.js`.
- Deterministic simulation stepping harness already supported via `?manual=1` in `public/js/temple3d.js`.

---

## Out of Scope

- Rigid-body physics engines (Cannon.js, Ammo.js, Rapier) — too heavy for mobile/OBS 30 FPS constraints.
- Vertical multi-level 3D pathfinding (navmesh climbing/stairs).
- Complex collision shapes (capsules/OBBs); 2D circular ground bounds are sufficient and significantly faster.

---

## Further Notes

- Maintains complete backward compatibility with existing JSON-RPC methods (`temple.*`, `live.*`).
- CPU overhead is constrained under $< 0.5\text{ms}$ per frame by bounding avoidance checks to active moving avatars only ($< 10$ simultaneous walkers at any time).
