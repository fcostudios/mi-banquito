import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import CollectionsLoading from "./loading";

it("announces the localized collection loading state", () => {
  render(<CollectionsLoading />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando colectas…");
});
