import { vi, describe, test, expect } from "vitest";
import $, {
  clearSubscriptions,
  sparkleRoot,
  sparkles,
  sparkleScope,
  subscribe,
} from "./index";

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

      if (element.type === undefined) {
        console.log("hi");
      }

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

function Child(props: { text: string }) {
  return <div>{props.text}</div>;
}

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
  describe("state", () => {
    test("should update state", () => {
      render(<App />);
      expect(sparkles).toMatchInlineSnapshot(`
        {
          "App.0": Sparkle {
            "_initializer": "Hello",
            "_state": 2,
            "_value": "Hello",
          },
          "App.1": Sparkle {
            "_initializer": [Function],
            "_state": 2,
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
      expect(render(<App />)).toMatchInlineSnapshot(`"<div><div>Hello World</div><div>5</div></div>"`);
    });
  });
});
