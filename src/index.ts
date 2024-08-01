type IsFunction<T> = T extends (...args: any[]) => any ? true : false;
type Initializer<T> = IsFunction<T> extends true
  ? never
  : T | (() => T | Promise<T>);

type Updater<T> = IsFunction<T> extends true
  ? never
  : T | ((t: T) => T | Promise<T>);

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

type Item<T> = {
  updater: Updater<T>;
  resolve?: (value: T) => void;
  reject?: (error: any) => void;
};

export class Sparkle<T> {
  #queue: Item<T>[];
  #promise: Promise<T> | undefined;
  _state: SparkleState;
  _value: T | undefined;
  _error: any;
  #dependents: Set<Sparkle<any>> = new Set();
  #options: Options;
  constructor(initializer: Initializer<T>, options: Options = {}) {
    this.#queue = [{ updater: initializer }];
    this._state = SparkleState.Uninitialized;
    this.#options = options;
  }

  get _dependents() {
    return this.#dependents;
  }

  get state() {
    return this._state;
  }

  update(t: Updater<T>) {
    if (
      this._state === SparkleState.Fulfilled ||
      this._state === SparkleState.Rejected
    ) {
      this.#queue.shift();
    }
    this._state = SparkleState.Stale;

    return new Promise<T>((resolve, reject) => {
      this.#queue.push({ updater: t, resolve, reject });
      const unsub = subscribe(() => {
        unsub();
        this.#maybeLoad();
      });
      changed();
    });
  }

  #next() {
    if (this.#queue.length > 1) {
      this.#queue.shift();
      this._state === SparkleState.Stale;
      this.#maybeLoad();
    }
  }

  refresh() {
    this._state = SparkleState.Uninitialized;
    this.#maybeLoad();
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
      this.#queue[0]?.reject?.(error);
      this._state = SparkleState.Rejected;
      this._error = error;
      this.#refreshDependents();
      this.#next();
      changed();
    }
  }

  #maybeLoad() {
    if (
      this._state === SparkleState.Uninitialized ||
      this._state === SparkleState.Stale ||
      this._state === SparkleState.Blocked
    ) {
      let result;
      const orig = initializedBy;
      try {
        initializedBy = this;
        const { updater, resolve, reject } = this.#queue[0];
        result = typeof updater === "function" ? updater(this._value) : updater;
      } catch (error) {
        this.#handleError(error);
        return;
      } finally {
        initializedBy = orig;
      }
      if (result instanceof Promise) {
        this.#promise = result;
        result.then(
          (value) => {
            this._state = SparkleState.Fulfilled;
            this.#queue[0]?.resolve?.(value);
            this._value = value;
            this.#next();
            this.#refreshDependents();
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
        this.#queue[0]?.resolve?.(result);
        this._state = SparkleState.Fulfilled;
        this._value = result;
        this.#next();
        this.#refreshDependents();
        changed();
      }
    }
  }

  #refreshDependents() {
    for (const dependent of this.#dependents) {
      dependent.refresh();
    }
  }

  get value() {
    initializedBy && this.#dependents.add(initializedBy);
    this.#maybeLoad();
    if (this._state === SparkleState.Rejected) {
      throw this._error;
    }
    if (
      this._state === SparkleState.Fulfilled ||
      this._state === SparkleState.Stale
    ) {
      return this._value;
    }
    throw this._state;
  }
}

let initializedBy: Sparkle<any> | undefined;
