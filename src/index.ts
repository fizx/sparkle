export type Initializer<T> = T | (() => T | Promise<T>);

export default function $<T>(initializer: Initializer<T>) {
  return new Sparkle<T>(initializer);
}

export enum SparkleState {
  Uninitialized,
  Pending,
  Fulfilled,
  Rejected,
  Stale,
}

export class Sparkle<T> {
  #initializer: Initializer<T>;
  #state: SparkleState;
  #value: T | undefined;
  #error: any;
  constructor(initializer: Initializer<T>) {
    this.#initializer = initializer;
    this.#state = SparkleState.Uninitialized;
  }

  get state() {
    return this.#state;
  }

  update(t: T) {
    this.#state = SparkleState.Fulfilled;
    this.#value = t;
  }

  then(onFulfilled: (value: T) => any, onRejected?: (error: any) => any) {
    if (this.#state === SparkleState.Fulfilled) {
      if (this.#value !== undefined) {
        onFulfilled(this.#value);
      } else {
        throw new Error("Value is undefined");
      }
    } else if (this.#state === SparkleState.Rejected) {
      onRejected?.(this.#error);
    }
  }

  get value() {
    if (this.#error) {
      throw this.#error;
    }
    if (this.#state === SparkleState.Fulfilled) {
      return this.#value;
    }
    throw this.#state;
  }
}
