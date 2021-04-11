import { Deferred, deferred } from "../deps.ts";

export class DeferredStack<T> {
  #array: Array<T>;
  #creator?: () => Promise<T>;
  #max_size: number;
  #queue: Array<Deferred<T>>;
  #size: number;

  constructor(
    max?: number,
    ls?: Iterable<T>,
    creator?: () => Promise<T>,
  ) {
    this.#array = ls ? [...ls] : [];
    this.#creator = creator;
    this.#max_size = max || 10;
    this.#queue = [];
    this.#size = this.#array.length;
  }

  get available(): number {
    return this.#array.length;
  }

  async pop(): Promise<T> {
    if (this.#array.length > 0) {
      return this.#array.pop()!;
    } else if (this.#size < this.#max_size && this.#creator) {
      this.#size++;
      return await this.#creator();
    }
    const d = deferred<T>();
    this.#queue.push(d);
    await d;
    return this.#array.pop()!;
  }

  push(value: T): void {
    this.#array.push(value);
    if (this.#queue.length > 0) {
      const d = this.#queue.shift()!;
      d.resolve();
    }
  }

  get size(): number {
    return this.#size;
  }
}
