export type Deferred<T = any, R = Error> = {
  promise: Promise<T>;
  resolve: (t?: T) => void;
  reject: (r?: R) => void;
  readonly handled: boolean;
};

/** Create deferred promise that can be resolved and rejected by outside */
export function defer<T>(): Deferred<T> {
  let handled = false,
    resolve,
    reject;

  const promise = new Promise<T>((res, rej) => {
    resolve = r => {
      handled = true;
      res(r);
    };
    reject = r => {
      handled = true;
      rej(r);
    };
  });

  return {
    promise,
    resolve,
    reject,

    get handled() {
      return handled;
    }
  };
}

export class DeferredStack<T> {
  private _array: Array<T>;
  private _queue: Array<Deferred>;

  constructor(ls?: Iterable<T>) {
    this._array = ls ? [...ls] : [];
    this._queue = [];
  }

  async pop(): Promise<T> {
    if (this._array.length > 0) {
      return this._array.pop();
    }
    const d = defer();
    this._queue.push(d);
    await d.promise;
    return this._array.pop();
  }

  push(value: T): void {
    this._array.push(value);
    if (this._queue.length > 0) {
      const d = this._queue.shift();
      d.resolve();
    }
  }

  get size(): number {
    return this._array.length;
  }
}
