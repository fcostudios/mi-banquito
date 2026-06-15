import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const useUser = vi.fn();

vi.mock("@auth0/nextjs-auth0", () => ({
  useUser: () => useUser(),
}));

describe("Sidebar", () => {
  it("shows treasurer nav and hides admin nav for TESORERA", () => {
    useUser.mockReturnValue({ user: { "https://mi-banquito.app/roles": ["TESORERA"] } });

    render(<Sidebar />);

    expect(screen.getByText("Socias")).toBeInTheDocument();
    expect(screen.queryByText("Estado de crons")).not.toBeInTheDocument();
  });

  it("shows admin nav and hides treasurer nav for PLATFORM_OPERATOR", () => {
    useUser.mockReturnValue({ user: { "https://mi-banquito.app/roles": ["PLATFORM_OPERATOR"] } });

    render(<Sidebar />);

    expect(screen.getByText("Estado de crons")).toBeInTheDocument();
    expect(screen.queryByText("Socias")).not.toBeInTheDocument();
  });
});
