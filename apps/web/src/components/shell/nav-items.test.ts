import { Banknote, HandCoins, Home, Users, Wallet } from "lucide-react";
import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items.gen";

describe("generated nav items", () => {
  it("uses meaningful icons for the mobile primary actions", () => {
    expect(navItems.find((item) => item.id === "nav-home")?.icon).toBe(Home);
    expect(navItems.find((item) => item.id === "nav-members")?.icon).toBe(Users);
    expect(navItems.find((item) => item.id === "nav-contributions")?.icon).toBe(Wallet);
    expect(navItems.find((item) => item.id === "nav-base-fund-quota")?.icon).toBe(Banknote);
    expect(navItems.find((item) => item.id === "nav-loans")?.icon).toBe(HandCoins);
  });
});
