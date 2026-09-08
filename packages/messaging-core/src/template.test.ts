import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template";

describe("renderTemplate", () => {
  it("substitutes a top-level placeholder", () => {
    expect(renderTemplate("Hi {{name}}!", { name: "Ada" })).toBe("Hi Ada!");
  });

  it("substitutes a nested dot-path placeholder", () => {
    expect(renderTemplate("Hi {{contact.name}}, from {{contact.company}}", { contact: { name: "Ada", company: "Acme" } })).toBe(
      "Hi Ada, from Acme",
    );
  });

  it("leaves an unresolved placeholder untouched instead of dropping it", () => {
    expect(renderTemplate("Hi {{contact.nickname}}", { contact: { name: "Ada" } })).toBe("Hi {{contact.nickname}}");
  });

  it("handles a body with no placeholders", () => {
    expect(renderTemplate("Plain message", {})).toBe("Plain message");
  });

  it("substitutes multiple placeholders in one body", () => {
    expect(renderTemplate("{{a}} + {{b}} = {{c}}", { a: 1, b: 2, c: 3 })).toBe("1 + 2 = 3");
  });
});
