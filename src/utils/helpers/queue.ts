export class Queue<T> {
  private store: T[] = [];
  private head = 0;

  constructor(initial?: T[]) {
    if (initial?.length) this.store = initial.slice();
  }

  get length(): number {
    return this.store.length - this.head;
  }

  push(...items: T[]): number {
    if (items.length) this.store.push(...items);
    return this.length;
  }

  shift(): T | undefined {
    if (this.length === 0) return undefined;
    const value = this.store[this.head++];
    if (this.head > 1024 && this.head * 2 > this.store.length) {
      this.store = this.store.slice(this.head);
      this.head = 0;
    }
    return value;
  }
}
