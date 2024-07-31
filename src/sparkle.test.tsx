import { vi, describe, test, expect, beforeEach } from "vitest";
import $, {
  clearSubscriptions,
  sparkleRoot,
  sparkles,
  sparkleScope,
  subscribe,
} from "./index";
import exp from "constants";

export interface JSXElement {
  type: string | ((props: { [key: string]: any }) => JSXElement);
  props: {
    [key: string]: any;
    children: Array<JSXElement | string>;
  };
}

export function customJSX(
  type: string,
  props: { [key: string]: any },
  ...children: Array<JSXElement | string>
): JSXElement {
  return { type, props: { ...props, children } };
}

export function render(element: JSXElement): string {
  return sparkleRoot(() => {
    return renderElement(element);
  });
}

function isFunction(value: any): value is Function {
  return typeof value === "function";
}

export function renderElement(element: JSXElement): string {
  return sparkleScope(
    isFunction(element.type) ? element.type.name : element.type,
    () => {
      if (isFunction(element.type)) {
        const component = element.type(element.props);
        return renderElement(component);
      }

      const children = (element.props?.children || [])
        .map((child: JSXElement | string) =>
          typeof child !== "function" && typeof child !== "object"
            ? child.toString()
            : renderElement(child)
        )
        .join("");

      return `<${element.type}${formatProps(element.props)}>${children}</${
        element.type
      }>`;
    }
  );
}

function formatProps(props?: { [key: string]: any }): string {
  return Object.entries(props || {})
    .filter(([key]) => key !== "children")
    .map(([key, value]) => ` ${key}="${value}"`)
    .join("");
}

function HelloApp() {
  return (
    <div>
      <div>Sparkle</div>
      <Child text="Hello" />
    </div>
  );
}
let calls = 0;
function App() {
  const title = $("Hello");
  const count = $(() => {
    calls++;
    return title.value.length;
  });
  return (
    <div>
      <div>{title.value}</div>
      <div>{count.value}</div>
    </div>
  );
}

function ChainedPromisesApp({
  a,
  b,
}: {
  a: Promise<string>;
  b: Promise<string>;
}) {
  const first = $(() => {
    return a;
  });
  const second = $(async () => {
    calls++;
    if (calls > 100) {
      throw new Error("too many calls");
    }
    return first.value + " " + (await b);
  });
  return (
    <div>
      <div>{second.loading ? "loading" : second.value}</div>
    </div>
  );
}

function Child(props: { text: string }) {
  return <div>{props.text}</div>;
}

beforeEach(() => {
  calls = 0;
  clearSubscriptions();
  for (const key in sparkles) {
    delete sparkles[key];
  }
});

describe("sparkle", () => {
  describe("render", () => {
    test("should render", () => {
      expect(render(<HelloApp />)).toMatchInlineSnapshot(
        `"<div><div>Sparkle</div><div>Hello</div></div>"`
      );
    });

    test("should render with sparkle", () => {
      expect(render(<App />)).toMatchInlineSnapshot(
        `"<div><div>Hello</div><div>5</div></div>"`
      );
    });
  });

  describe("promises chaining", () => {
    test("should be initially loading", async () => {
      const a = new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve("Hello");
        }, 10);
      });
      const b = new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve("World");
        }, 10);
      });
      expect(render(<ChainedPromisesApp a={a} b={b} />)).toMatchInlineSnapshot(
        `"<div><div>loading</div></div>"`
      );
      expect(sparkles).toMatchInlineSnapshot(`
        {
          "ChainedPromisesApp.0": Sparkle {
            "_state": "pending",
          },
          "ChainedPromisesApp.1": Sparkle {
            "_state": "pending",
          },
        }
      `);
    });

    test("should be loading if a is loading even if b would be resolved", async () => {
      const states: Array<any> = [];
      subscribe(() => {
        states.push({ ...sparkles });
      });
      const a = new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve("Hello");
        }, 5);
      });
      const b = new Promise<string>((resolve) => {
        resolve("World");
      });
      expect(render(<ChainedPromisesApp a={a} b={b} />)).toMatchInlineSnapshot(
        `"<div><div>loading</div></div>"`
      );
      expect(sparkles).toMatchInlineSnapshot(`
        {
          "ChainedPromisesApp.0": Sparkle {
            "_state": "pending",
          },
          "ChainedPromisesApp.1": Sparkle {
            "_state": "pending",
          },
        }
      `);
      // wait for all promises to resolve
      function anyPending() {
        return Object.values(sparkles).some((s) => s.state === "pending");
      }
      let i = 0;
      while (anyPending() && i++ < 10) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(!anyPending()).toBe(true);
      expect(render(<ChainedPromisesApp a={a} b={b} />)).toMatchInlineSnapshot(
        `"<div><div>Hello World</div></div>"`
      );
    });
  });

  describe("state", () => {
    test("should update state", () => {
      render(<App />);
      expect(sparkles).toMatchInlineSnapshot(`
        {
          "App.0": Sparkle {
            "_state": "fulfilled",
            "_value": "Hello",
          },
          "App.1": Sparkle {
            "_state": "fulfilled",
            "_value": 5,
          },
        }
      `);
    });

    test("should reuse sparkles", () => {
      render(<App />);
      expect(calls).toBe(1);
      render(<App />);
      expect(calls).toBe(1);
    });

    test("changes should be detected", () => {
      clearSubscriptions();
      let notis = 0;
      render(<App />);
      subscribe(() => {
        notis++;
      });
      sparkles["App.0"].update("Hello World");
      expect(notis).toBe(1);
      expect(render(<App />)).toMatchInlineSnapshot(
        `"<div><div>Hello World</div><div>5</div></div>"`
      );
    });
  });
});
