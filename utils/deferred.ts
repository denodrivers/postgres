import { type Deferred, deferred } from "../deps.ts";

export class DeferredStack<T> {
  #elements: Array<T>;
  #creator?: () => Promise<T>;
  #max_size: number;
  #queue: Array<Deferred<T>>;
  #size: number;

  constructor(
    max?: number,
    ls?: Iterable<T>,
    creator?: () => Promise<T>,
  ) {
    this.#elements = ls ? [...ls] : [];
    this.#creator = creator;
    this.#max_size = max || 10;
    this.#queue = [];
    this.#size = this.#elements.length;
  }

  get available(): number {
    return this.#elements.length;
  }

  async pop(): Promise<T> {
    if (this.#elements.length > 0) {
      return this.#elements.pop()!;
    } else if (this.#size < this.#max_size && this.#creator) {
      this.#size++;
      return await this.#creator();
    }
    const d = deferred<T>();
    this.#queue.push(d);
    return await d;
  }

  push(value: T): void {
    if (this.#queue.length > 0) {
      const d = this.#queue.shift()!;
      d.resolve(value);
    } else {
      this.#elements.push(value);
    }
  }

  get size(): number {
    return this.#size;
  }
}

/**
 * The DeferredAccessStack provides access to a series of elements provided on the stack creation,
 * but with the caveat that they require an initialization of sorts before they can be used
 *
 * Instead of providing a `creator` function as you would with the `DeferredStack`, you provide
 * an initialization callback to execute for each element that is retrieved from the stack and a check
 * callback to determine if the element requires initialization and return a count of the initialized
 * elements
 */
export class DeferredAccessStack<T> {
  #elements: Array<T>;
  #initializeElement: (element: T) => Promise<void>;
  #checkElementInitialization: (element: T) => Promise<boolean> | boolean;
  #queue: Array<Deferred<T>>;
  #size: number;

  get available(): number {
    return this.#elements.length;
  }

  /**
   * The max number of elements that can be contained in the stack a time
   */
  get size(): number {
    return this.#size;
  }

  /**
   * @param initialize This function will execute for each element that hasn't been initialized when requested from the stack
   */
  constructor(
    elements: T[],
    initCallback: (element: T) => Promise<void>,
    checkInitCallback: (element: T) => Promise<boolean> | boolean,
  ) {
    this.#checkElementInitialization = checkInitCallback;
    this.#elements = elements;
    this.#initializeElement = initCallback;
    this.#queue = [];
    this.#size = elements.length;
  }

  /**
   * Will execute the check for initialization on each element of the stack
   * and then return the number of initialized elements that pass the check
   */
  async initialized(): Promise<number> {
    const initialized = await Promise.all(
      this.#elements.map((e) => this.#checkElementInitialization(e)),
    );

    return initialized
      .filter((initialized) => initialized === true)
      .length;
  }

  async pop(): Promise<T> {
    let element: T;
    if (this.available > 0) {
      element = this.#elements.pop()!;
    } else {
      // If there are not elements left in the stack, it will await the call until
      // at least one is restored and then return it
      const d = deferred<T>();
      this.#queue.push(d);
      element = await d;
    }

    if (!await this.#checkElementInitialization(element)) {
      await this.#initializeElement(element);
    }
    return element;
  }

  push(value: T): void {
    // If an element has been requested while the stack was empty, indicate
    // that an element has been restored
    if (this.#queue.length > 0) {
      const d = this.#queue.shift()!;
      d.resolve(value);
    } else {
      this.#elements.push(value);
    }
  }
}
