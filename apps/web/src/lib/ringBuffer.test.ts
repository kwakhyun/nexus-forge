import { describe, expect, it } from "vitest";
import { RingBuffer } from "./ringBuffer";

describe("RingBuffer", () => {
  it("overwrites the oldest values without reallocating the buffer", () => {
    const buffer = new RingBuffer<number>(3);
    buffer.pushMany([1, 2, 3, 4, 5]);

    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it("replaces content and trims it to capacity", () => {
    const buffer = new RingBuffer<string>(2);
    buffer.replace(["a", "b", "c"]);
    expect(buffer.toArray()).toEqual(["b", "c"]);

    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
  });

  it("rejects invalid capacities", () => {
    expect(() => new RingBuffer(0)).toThrow("positive integer");
  });
});
