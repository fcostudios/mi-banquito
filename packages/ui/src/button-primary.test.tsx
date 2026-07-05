import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ButtonPrimary } from "./atoms/button-primary";

describe("ButtonPrimary", () => {
  it("uses the dedicated on-primary text token for readable green buttons", () => {
    const html = renderToStaticMarkup(<ButtonPrimary labelKey="common.save" />);

    expect(html).toContain("bg-primary");
    expect(html).toContain("text-text-on-primary");
    expect(html).toContain("font-semibold");
    expect(html).not.toContain("text-surface");
  });
});
