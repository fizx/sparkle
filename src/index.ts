type IsFunction<T> = T extends (...args: any[]) => any ? true : false;
type Initializer<T> = IsFunction<T> extends true
  ? never
  : T | (() => T | Promise<T>);

export default function $<T>(
  initializer: Initializer<T>,
  key: string = [...scope, nextId++].join(".")
) {
  const sparkle =
    key in lastSparkles ? lastSparkles[key] : new Sparkle<T>(initializer);
  sparkles[key] = sparkle!;
  return sparkle;
}

export enum SparkleState {
  Uninitialized,
  Pending,
  Fulfilled,
  Rejected,
  Stale,
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

export class Sparkle<T> {
  _initializer: Initializer<T>;
  _promise: Promise<T> | undefined;
  _state: SparkleState;
  _value: T | undefined;
  _error: any;
  constructor(initializer: Initializer<T>) {
    this._initializer = initializer;
    this._state = SparkleState.Uninitialized;
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
    }
  }

  get value() {
    if (this._state === SparkleState.Uninitialized) {
      this._state = SparkleState.Pending;
      const result =
        typeof this._initializer === "function"
          ? this._initializer()
          : this._initializer;
      if (result instanceof Promise) {
        this._promise = result;
        result.then(
          (value) => {
            this._state = SparkleState.Fulfilled;
            this._value = value;
            changed();
          },
          (error) => {
            this._state = SparkleState.Rejected;
            this._error = error;
            changed();
          }
        );
      } else {
        this._state = SparkleState.Fulfilled;
        this._value = result;
        changed();
      }
    }
    if (this._error) {
      throw this._error;
    }
    if (this._state === SparkleState.Fulfilled && this._value !== undefined) {
      return this._value;
    }
    throw this._state;
  }
}
