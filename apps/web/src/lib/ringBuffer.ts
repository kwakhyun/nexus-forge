export class RingBuffer<T> {
  private readonly values: Array<T | undefined>;
  private head = 0;
  private length = 0;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("RingBuffer capacity must be a positive integer");
    }
    this.values = new Array<T | undefined>(capacity);
  }

  clear(): void {
    this.values.fill(undefined);
    this.head = 0;
    this.length = 0;
  }

  replace(items: T[]): void {
    this.clear();
    this.pushMany(items.slice(-this.capacity));
  }

  push(value: T): void {
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    this.length = Math.min(this.length + 1, this.capacity);
  }

  pushMany(items: T[]): void {
    for (const item of items) this.push(item);
  }

  discardWhile(predicate: (value: T) => boolean): void {
    while (this.length > 0) {
      const index = (this.head - this.length + this.capacity) % this.capacity;
      const value = this.values[index];
      if (value !== undefined && !predicate(value)) break;
      this.values[index] = undefined;
      this.length -= 1;
    }
  }

  toArray(): T[] {
    const output: T[] = [];
    const start = (this.head - this.length + this.capacity) % this.capacity;
    for (let index = 0; index < this.length; index += 1) {
      const value = this.values[(start + index) % this.capacity];
      if (value !== undefined) output.push(value);
    }
    return output;
  }

  get size(): number {
    return this.length;
  }
}
