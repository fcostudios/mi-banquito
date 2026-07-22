import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import CollectionsError from "./error";

it("offers a localized retry without leaking the error detail", () => {
  const reset = vi.fn();
  render(<CollectionsError error={new Error("database password secret")} reset={reset} />);
  expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar las colectas");
  expect(screen.queryByText(/database password secret/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(reset).toHaveBeenCalledOnce();
});
