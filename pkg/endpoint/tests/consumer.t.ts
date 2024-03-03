import "@ndn/packet/test-fixture/expect";

import { Forwarder } from "@ndn/fw";
import { Data, Interest, type Verifier } from "@ndn/packet";
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest";

import { consume, produce, type ProducerHandler, type RetxPolicy } from "..";

afterEach(Forwarder.deleteDefault);

describe("retx limit", () => {
  let producer: Mock<Parameters<ProducerHandler>, ReturnType<ProducerHandler>>;

  beforeEach(() => {
    producer = vi.fn<Parameters<ProducerHandler>, ReturnType<ProducerHandler>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(new Data("/A"));
    produce("/A", producer);
  });

  test("resolve", async () => {
    const promise = consume(
      new Interest("/A", Interest.Lifetime(500)),
      {
        retx: {
          limit: 2,
          interval: 50,
        },
      },
    );
    await expect(promise).resolves.toBeInstanceOf(Data);
    expect(producer).toHaveBeenCalledTimes(3);
    expect(promise.nRetx).toBe(2);
  });

  test.each<[RetxPolicy, number]>([
    [{}, 1],
    [{ limit: 1, interval: 50 }, 2],
    [function*() { yield 60; }, 2], // retx before timeout
    [function*() { yield 400; }, 2], // retx after timeout
    [0, 1],
    [1, 2],
  ])("reject %#", async (retx, nInterests) => {
    const promise = consume(
      new Interest("/A", Interest.Lifetime(200)),
      { retx },
    );
    await expect(promise).rejects.toThrow();
    expect(producer).toHaveBeenCalledTimes(nInterests);
    expect(promise.nRetx).toBe(nInterests - 1);
  });

  test("abort", async () => {
    const promise = consume(
      new Interest("/A", Interest.Lifetime(2000)),
      {
        signal: AbortSignal.timeout(100),
        retx: {
          limit: 2,
        },
      });
    await expect(promise).rejects.toThrow();
    expect(producer).toHaveBeenCalledTimes(1);
    expect(promise.nRetx).toBe(0);
  });
});

test("verify", async () => {
  const producer = vi.fn<Parameters<ProducerHandler>, ReturnType<ProducerHandler>>()
    .mockResolvedValueOnce(new Data("/A"));
  produce("/A", producer);

  const verify = vi.fn<Parameters<Verifier["verify"]>, ReturnType<Verifier["verify"]>>()
    .mockRejectedValue(new Error("mock-verify-error"));

  const promise = consume(
    new Interest("/A", Interest.Lifetime(200)),
    { verifier: { verify } },
  );
  await expect(promise).rejects.toThrow(/mock-verify-error/);
  expect(producer).toHaveBeenCalledTimes(1);
});
