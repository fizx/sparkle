import { vi, describe, test, expect } from "vitest";

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
  if (typeof element.type === "function") {
    const component = element.type(element.props);
    return render(component);
  }

  const children = (element.props.children || [])
    .map((child: JSXElement | string) =>
      typeof child === "string" ? child : render(child)
    )
    .join("");

  return `<${element.type}${formatProps(element.props)}>${children}</${
    element.type
  }>`;
}

function formatProps(props: { [key: string]: any }): string {
  return Object.entries(props)
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
  });
});
