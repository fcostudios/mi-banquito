import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BaseFundQuotaConfigRequired } from "./config-required";

describe("BaseFundQuotaConfigRequired", () => {
  it("replaces the fatal error with an explicit mobile-friendly configuration route", () => {
    render(<BaseFundQuotaConfigRequired />);

    expect(screen.getByRole("alert")).toHaveTextContent("no hay un monto de cuota base aprobado");
    expect(screen.getByRole("link", { name: "Ir a Configuración del grupo" }))
      .toHaveAttribute("href", "/grupo?editar=1");
  });
});
