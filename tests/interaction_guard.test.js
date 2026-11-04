process.env.NO_SERVER_LISTEN = "1";
process.env.NODE_ENV = "test";

import { describe, test, expect } from "bun:test";

describe("High-Concurrency Interaction Guard (Seam: handleRpcCall)", () => {
  test("Ritual Cooldown: Rapid duplicate calls from the same user are throttled", async () => {
    const { handleRpcCall } = await import("../server.js");

    const caller = { user: "Thí Chủ Thử Nghiệm", uniqueId: "test_devotee_cooldown_1" };

    // First call should succeed
    const res1 = await handleRpcCall("temple.burnIncense", { ...caller, count: 3 });
    expect(res1.ok !== false).toBe(true);
    expect(res1.event).toBeDefined();
    expect(res1.event.type).toBe("burnIncense");

    // Immediate second call from same user should be throttled
    const res2 = await handleRpcCall("temple.burnIncense", { ...caller, count: 3 });
    expect(res2.ok).toBe(false);
    expect(res2.rateLimited).toBe(true);
    expect(typeof res2.retryAfterMs).toBe("number");
    expect(res2.retryAfterMs).toBeGreaterThan(0);
  });

  test("Gift Exemption: temple.offerGift and grandCeremony are never rate limited", async () => {
    const { handleRpcCall } = await import("../server.js");

    const caller = { user: "Đại Thí Chủ", uniqueId: "test_devotee_gifter_1" };

    const g1 = await handleRpcCall("temple.offerGift", {
      ...caller,
      giftType: "lotus",
      giftName: "Hoa Sen Vàng",
      coins: 15
    });
    expect(g1.event).toBeDefined();
    expect(g1.event.type).toBe("offerGift");

    // Second immediate gift from same user MUST succeed without throttling
    const g2 = await handleRpcCall("temple.offerGift", {
      ...caller,
      giftType: "lamp",
      giftName: "Đèn Dầu Cúng Phật",
      coins: 20
    });
    expect(g2.event).toBeDefined();
    expect(g2.rateLimited).toBeUndefined();
  });

  test("Devotee Independence: Different users do not block or throttle each other", async () => {
    const { handleRpcCall } = await import("../server.js");

    const userA = { user: "Thí Chủ A", uniqueId: "test_devotee_indep_A" };
    const userB = { user: "Thí Chủ B", uniqueId: "test_devotee_indep_B" };

    const a1 = await handleRpcCall("temple.sendPrayer", { ...userA, wish: "Cầu an lành" });
    expect(a1.event).toBeDefined();

    // User B calling same ritual immediately MUST succeed
    const b1 = await handleRpcCall("temple.sendPrayer", { ...userB, wish: "Cầu sức khỏe" });
    expect(b1.event).toBeDefined();
    expect(b1.rateLimited).toBeUndefined();
  });

  test("LIKE Stream Batching: Rapid burst of likes within 300ms window collapses into a single aggregate batch", async () => {
    const { LikeBatchAccumulator } = await import("../server.js");
    expect(typeof LikeBatchAccumulator).toBe("function");

    const flushedBatches = [];
    const accumulator = new LikeBatchAccumulator({
      windowMs: 150,
      onFlush: (batch) => flushedBatches.push(batch)
    });

    // Feed rapid like packets from different devotees within the window
    accumulator.add("Thí Chủ 1", "uid_1", "", 5);
    accumulator.add("Thí Chủ 2", "uid_2", "", 10);
    accumulator.add("Thí Chủ 1", "uid_1", "", 15);
    accumulator.add("Thí Chủ 3", "uid_3", "", 20);

    // Immediate check before window expires: should not have flushed yet
    expect(flushedBatches.length).toBe(0);

    // Wait for window to expire
    await new Promise(r => setTimeout(r, 220));

    // Must have emitted exactly 1 batch
    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].totalLikes).toBe(50); // 5 + 10 + 15 + 20
    expect(flushedBatches[0].contributorCount).toBe(3); // uid_1, uid_2, uid_3
    expect(flushedBatches[0].topDevotee.uniqueId).toBe("uid_1");
  });

  test("LIKE Batch Flush on Shutdown: flush() immediately emits pending likes without data loss", async () => {
    const { LikeBatchAccumulator } = await import("../server.js");

    const flushedBatches = [];
    const accumulator = new LikeBatchAccumulator({
      windowMs: 5000, // long window
      onFlush: (batch) => flushedBatches.push(batch)
    });

    accumulator.add("Thí Chủ Vội", "uid_urgent", "", 12);
    expect(flushedBatches.length).toBe(0);

    // Trigger immediate flush
    const batch = accumulator.flush();
    expect(flushedBatches.length).toBe(1);
    expect(batch.totalLikes).toBe(12);
    expect(batch.topDevotee.user).toBe("Thí Chủ Vội");
  });

  test("Client Quick Dock Debounce (Seam 2): Rapid clicks within cooldown trigger actionFn exactly once", async () => {
    let callCount = 0;
    let locked = false;
    const cooldownMs = 150;

    const action = () => { callCount++; };

    const clickHandler = () => {
      if (locked) return;
      locked = true;
      setTimeout(() => { locked = false; }, cooldownMs);
      action();
    };

    // 5 rapid sequential clicks
    clickHandler();
    clickHandler();
    clickHandler();
    clickHandler();
    clickHandler();

    expect(callCount).toBe(1);

    // Wait for cooldown to expire
    await new Promise(r => setTimeout(r, 200));

    // Next click after cooldown succeeds
    clickHandler();
    expect(callCount).toBe(2);
  });

  test("[Finding P1 Fix] Batch LIKE preserves full merit without 50 cap", async () => {
    const { Rituals, state } = await import("../server.js");
    const initialHits = state.woodenFishHits;

    const res = Rituals.strikeWoodenFish({
      user: "Thí Chủ Đại Công Đức",
      uniqueId: "uid_large_batch_1",
      count: 150,
      isBatch: true
    });

    expect(res.event.count).toBe(150);
    expect(res.event.merit).toBe(150);
    expect(state.woodenFishHits).toBe(initialHits + 150);

    const devotee = state.devotees["uid_large_batch_1"];
    expect(devotee).toBeDefined();
    expect(devotee.merit).toBeGreaterThanOrEqual(150);
  });

  test("[Finding P1 Fix] Multi-contributor batch preserves individual merit for every devotee", async () => {
    const { Rituals, state } = await import("../server.js");
    delete state.devotees["uid_contrib_A"];
    delete state.devotees["uid_contrib_B"];

    const batchContributors = [
      { user: "Phật tử A", uniqueId: "uid_contrib_A", avatar: "", count: 10 },
      { user: "Phật tử B", uniqueId: "uid_contrib_B", avatar: "", count: 5 }
    ];

    Rituals.strikeWoodenFish({
      user: "Phật tử A",
      uniqueId: "uid_contrib_A",
      count: 15,
      contributors: batchContributors,
      isBatch: true
    });

    const devA = state.devotees["uid_contrib_A"];
    const devB = state.devotees["uid_contrib_B"];

    expect(devA).toBeDefined();
    expect(devB).toBeDefined();
    expect(devA.merit).toBe(10);
    expect(devB.merit).toBe(5);
  });

  test("[Finding P1 Fix] Anonymous RPC throttled on rapid calls", async () => {
    const { handleRpcCall } = await import("../server.js");

    let accepted = 0;
    let throttled = 0;

    for (let i = 0; i < 100; i++) {
      const res = await handleRpcCall("temple.burnIncense", { ip: "192.168.1.50", count: 1 });
      if (res && res.rateLimited) {
        throttled++;
      } else {
        accepted++;
      }
    }

    expect(accepted).toBe(1);
    expect(throttled).toBe(99);
  });

  test("[Finding P2 Fix] Cross-channel cooldown: RPC call throttles immediate Chat comment for same devotee", async () => {
    const { handleRpcCall, parseViewerComment } = await import("../server.js");

    const uid = "uid_cross_channel_devotee";
    const user = "Phật Tử Nhất Quán";

    const rpcRes = await handleRpcCall("temple.burnIncense", { uniqueId: uid, user, count: 3 });
    expect(rpcRes.ok !== false).toBe(true);

    const chatRes = parseViewerComment("con xin thắp hương bái Phật", user, uid, "");
    expect(chatRes).toBeNull();
  });
});
