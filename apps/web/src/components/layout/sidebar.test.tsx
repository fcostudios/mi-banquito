import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("Sidebar", () => {
  it("shows treasurer nav and hides admin nav for TESORERA", () => {
    render(<Sidebar roles={["TESORERA"]} />);

    expect(screen.getByText("Socias")).toBeInTheDocument();
    expect(screen.queryByText("Estado de crons")).not.toBeInTheDocument();
  });

  it("shows admin nav and hides treasurer nav for PLATFORM_OPERATOR", () => {
    render(<Sidebar roles={["PLATFORM_OPERATOR"]} />);

    expect(screen.getByText("Estado de crons")).toBeInTheDocument();
    expect(screen.queryByText("Socias")).not.toBeInTheDocument();
  });
});
