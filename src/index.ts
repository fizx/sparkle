type IsFunction<T> = T extends (...args: any[]) => any ? true : false;
type Initializer<T> = IsFunction<T> extends true
  ? never
  : T | (() => T | Promise<T>);

export default function $<T>(
  initializer: Initializer<T>,
  key: string = [...scope, nextId++].join(".")
) {
  const sparkle =
    key in lastSparkles
      ? lastSparkles[key]
      : new Sparkle<T>(initializer, { key });
  sparkles[key] = sparkle!;
  return sparkle;
}

export enum SparkleState {
  Uninitialized = "uninitialized",
  Pending = "pending",
  Blocked = "blocked",
  Fulfilled = "fulfilled",
  Rejected = "rejected",
  Stale = "stale",
}

function changed() {
  for (const key in callbacks) {
    callbacks[key]();
  }
}

let nextCallbackId = 0;
let callbacks: { [key: number]: () => void } = {};

export function subscribe(callback: () => void): () => void {
  const id = nextCallbackId++;
  callbacks[id] = callback;
  return () => {
    delete callbacks[id];
  };
}

export function clearSubscriptions() {
  callbacks = {};
}

export let scope: string[] = [];
export let sparkles: { [key: string]: Sparkle<any> } = {};
export let lastSparkles: { [key: string]: Sparkle<any> } = {};
let nextId = 0;

export function sparkleRoot<T>(f: () => T) {
  scope = [];
  nextId = 0;
  lastSparkles = { ...sparkles };
  sparkles = {};
  try {
    return f();
  } finally {
    scope = [];
    for (const key in lastSparkles) {
      if (!(key in sparkles)) {
        delete lastSparkles[key];
      }
    }
  }
}

export function sparkleScope<T>(name: string, f: () => T) {
  scope.push(name);
  const origNextId = nextId;
  try {
    return f();
  } finally {
    scope.pop();
    nextId = origNextId;
  }
}

type Options = {
  key?: string;
};

export class Sparkle<T> {
  #initializer: Initializer<T>;
  #promise: Promise<T> | undefined;
  _state: SparkleState;
  _value: T | undefined;
  _error: any;
  #options: Options;
  constructor(initializer: Initializer<T>, options: Options = {}) {
    this.#initializer = initializer;
    this._state = SparkleState.Uninitialized;
    this.#options = options;
  }

  get state() {
    return this._state;
  }

  update(t: T) {
    this._state = SparkleState.Fulfilled;
    this._value = t;
    changed();
  }

  then(onFulfilled: (value: T) => any, onRejected?: (error: any) => any) {
    if (this._state === SparkleState.Fulfilled) {
      if (this._value !== undefined) {
        onFulfilled(this._value);
      } else {
        throw new Error("Value is undefined");
      }
    } else if (this._state === SparkleState.Rejected) {
      onRejected?.(this._error);
    } else {
      const unsub = subscribe(() => {
        unsub();
        this.then(onFulfilled, onRejected);
      });
    }
  }

  get loading() {
    this.#maybeLoad();
    return this._state === SparkleState.Pending;
  }

  #handleError(error: any) {
    if (error === SparkleState.Pending || error === SparkleState.Blocked) {
      const unsub = subscribe(() => {
        unsub();
        this.#maybeLoad();
      });
      const was = this._state;
      this._state = SparkleState.Blocked;
      if (was !== SparkleState.Blocked) {
        changed();
      }
    } else {
      this._state = SparkleState.Rejected;
      this._error = error;
      changed();
    }
  }

  #maybeLoad() {
    if (
      this._state === SparkleState.Uninitialized ||
      this._state === SparkleState.Blocked
    ) {
      let result;
      try {
        result =
          typeof this.#initializer === "function"
            ? this.#initializer()
            : this.#initializer;
      } catch (error) {
        this.#handleError(error);
        return;
      }
      if (result instanceof Promise) {
        this.#promise = result;
        result.then(
          (value) => {
            this._state = SparkleState.Fulfilled;
            this._value = value;
            changed();
          },
          (error) => {
            this.#handleError(error);
          }
        );
        if (this._state === SparkleState.Uninitialized) {
          this._state = SparkleState.Pending;
          changed();
        }
      } else {
        this._state = SparkleState.Fulfilled;
        this._value = result;
        changed();
      }
    }
  }

  get value() {
    this.#maybeLoad();
    if (this._state === SparkleState.Rejected) {
      throw this._error;
    }
    if (this._state === SparkleState.Fulfilled && this._value !== undefined) {
      return this._value;
    }
    throw this._state;
  }
}
