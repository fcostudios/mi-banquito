import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InputText } from "./atoms/input-text";

describe("InputText", () => {
  it("does not forward label-only props to the native input", () => {
    const html = renderToStaticMarkup(<InputText labelKey="Nombre" name="displayName" />);

    expect(html).not.toContain("labelKey");
    expect(html).not.toContain("labelkey");
  });
});
