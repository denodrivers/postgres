export type Deferred<T = any, R = Error> = {
  promise: Promise<T>;
  resolve: (t?: T) => void;
  reject: (r?: R) => void;
  readonly handled: boolean;
};

export type DeferredItemCreator<T> = () => Promise<T>;

/** Create deferred promise that can be resolved and rejected by outside */
export function defer<T, R>(): Deferred<T> {
  let handled = false,
    resolve: (t?: T) => void | undefined,
    reject: (r?: any) => void | undefined;

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
    resolve: resolve!,
    reject: reject!,

    get handled() {
      return handled;
    }
  };
}

export class DeferredStack<T> {
  private _array: Array<T>;
  private _queue: Array<Deferred>;
  private _maxSize: number;
  private _size: number;

  constructor(
    max?: number,
    ls?: Iterable<T>,
    private _creator?: DeferredItemCreator<T>
  ) {
    this._maxSize = max || 10;
    this._array = ls ? [...ls] : [];
    this._size = this._array.length;
    this._queue = [];
  }

  async pop(): Promise<T> {
    if (this._array.length > 0) {
      return this._array.pop()!;
    } else if (this._size < this._maxSize && this._creator) {
      this._size++;
      return await this._creator();
    }
    const d = defer();
    this._queue.push(d);
    await d.promise;
    return this._array.pop()!;
  }

  push(value: T): void {
    this._array.push(value);
    if (this._queue.length > 0) {
      const d = this._queue.shift()!;
      d.resolve();
    }
  }

  get size(): number {
    return this._size;
  }

  get available(): number {
    return this._array.length;
  }
}
