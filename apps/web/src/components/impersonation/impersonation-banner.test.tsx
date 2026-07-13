import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImpersonationBanner } from "./impersonation-banner";

describe("persistent impersonation banner", () => {
  it("shows read-only context, organization, reason, expiry, and an explicit end POST", () => {
    const { container } = render(<ImpersonationBanner
      orgName="Banquito Las Flores"
      reason="Investigar cierre mensual"
      expiresAt={new Date("2026-07-13T03:15:00.000Z")}
    />);

    expect(screen.getByText("Viendo como tesorera en modo solo lectura")).toBeTruthy();
    expect(screen.getByText("Banquito Las Flores")).toBeTruthy();
    expect(screen.getByText(/Investigar cierre mensual/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salir de impersonación" })).toBeTruthy();
    expect(container.querySelector("form")?.getAttribute("method")).toBe("post");
    expect(container.querySelector("form")?.getAttribute("action")).toBe("/api/impersonation/end");
    expect(container.firstElementChild?.className).toContain("md:flex-row");
  });
});
