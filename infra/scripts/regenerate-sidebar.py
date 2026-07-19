#!/usr/bin/env python3
"""regenerate-sidebar.py — write nav-items.gen.ts from the nav map.

The sidebar is a UX decision owned by the nav map (`app_shell.sidebar.items[]` +
`app_shell.mobile_bottom_bar.items[]`). This generator flattens that spec into a
TypeScript module that sidebar.tsx imports — keeping ordering, roles, badges, and
labels in sync with one run.

Usage (from repo root):
  ./infra/scripts/regenerate-sidebar.py
  ./infra/scripts/regenerate-sidebar.py --check   # non-writing, exit 1 if out of sync

The generator is idempotent. Runs in <1s. Safe in pre-commit / CI.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
NAV_MAP = REPO_ROOT / "docs" / "specs" / "07c_navigation_map.json"
OUT_FILE = REPO_ROOT / "apps" / "web" / "src" / "components" / "shell" / "nav-items.gen.ts"

# IMP-137 / I03: Lucide icon allow-list emission. The generator's ICON_MAP is
# the canonical allow-list; we emit a sibling JSON every run so the Nous
# pipeline's ready-check 100 can validate sidebar icons against it. Idempotent:
# only writes when the content would change.
ALLOW_LIST_OUT = REPO_ROOT / "infra" / "scripts" / "allowed_lucide_icons.json"
ALLOW_LIST_VERSION = "1"

# The fallback icon emitted for nav items whose declared icon is not in
# ICON_MAP (or have none). This is the SINGLE source for the fallback — it is
# threaded through both build_sidebar_array (the emitted import/icon) AND
# allow_list_payload (so the allow-list = declared ∪ fallbacks). Keeping it one
# constant is what makes the generated nav-items.gen.ts pass its OWN
# check-lucide-allowlist.mjs (IMP-245 / I01).
FALLBACK_ICON = "Circle"

# Lucide icon name → React component name (the lucide-react export).
# All icons in the nav map must map here; unknown icons fall back to FALLBACK_ICON.
ICON_MAP = {
    "AlertCircle": "AlertCircle",
    "Banknote": "Banknote",
    "CheckCircle2": "CheckCircle2",
    "Circle": "Circle",
    "FileText": "FileText",
    "HandCoins": "HandCoins",
    "History": "History",
    "Home": "Home",
    "LineChart": "LineChart",
    "Wallet": "Wallet",
    "LayoutDashboard": "LayoutDashboard",
    "Kanban": "Kanban",
    "Building2": "Building2",
    "Users": "Users",
    "TrendingUp": "TrendingUp",
    "Target": "Target",
    "Shuffle": "Shuffle",
    "BookOpen": "BookOpen",
    "Calendar": "Calendar",
    "Settings": "Settings",
    "Bell": "Bell",
    "User": "User",
    "Plus": "Plus",
    "Menu": "Menu",
    "UploadCloud": "UploadCloud",
    "Key": "Key",
    "Webhook": "Webhook",
    "List": "List",
    "ListChecks": "ListChecks",
    "Plug": "Plug",
}


def load_nav_map() -> dict:
    if not NAV_MAP.exists():
        print(f"✗ Nav map not found: {NAV_MAP}", file=sys.stderr)
        print("  Run: ./infra/scripts/sync-from-nous.sh", file=sys.stderr)
        sys.exit(1)
    with NAV_MAP.open() as f:
        return json.load(f)


def tsroles(roles: list[str]) -> str:
    """Convert nav-map roles (lowercase) to the dev-package UserRole enum (uppercase)."""
    if not roles or roles == ["all"]:
        return "undefined"
    upper = [f'"{r.upper()}"' for r in roles if r != "all"]
    return f"[{', '.join(upper)}]"


def label_key(item_id: str) -> str:
    """Convert nav item ids such as nav-import-data to i18n keys."""
    key_overrides = {
        "nav-cycles": "nav.cycle_targets",
        "nav-developers-api-keys": "nav.developer_keys",
        "nav-developers-webhooks": "nav.developer_webhooks",
        "nav-developers-deliveries": "nav.developer_deliveries",
    }
    if item_id in key_overrides:
        return key_overrides[item_id]
    key = item_id.removeprefix("nav-").replace("-", "_")
    return f"nav.{key}"


def build_sidebar_array(items: list[dict]) -> tuple[list[str], list[str]]:
    """Return (imports, array_lines) for the sidebar items."""
    icons_used: set[str] = set()
    lines: list[str] = []
    for it in items:
        icon = it.get("icon", FALLBACK_ICON)
        resolved = ICON_MAP.get(icon, FALLBACK_ICON)
        icons_used.add(resolved)
        lines.append(
            "  {\n"
            f'    id: "{it["id"]}",\n'
            f'    label: "{it["label"]}",\n'
            f'    labelKey: "{label_key(it["id"])}",\n'
            f'    icon: {resolved},\n'
            f'    href: "{it["route"]}",\n'
            f'    screenId: "{it.get("screen", "")}",\n'
            f"    roles: {tsroles(it.get('roles', []))},\n"
            + (f'    badge: "{it["badge"]}",\n' if it.get("badge") else "")
            + (f'    position: "{it["position"]}",\n' if it.get("position") else "")
            + "  }"
        )
    return sorted(icons_used), lines


def generate_ts(nav: dict) -> str:
    sidebar_items = nav["app_shell"]["sidebar"]["items"]
    icons, lines = build_sidebar_array(sidebar_items)

    meta = nav.get("meta", {})
    generated_at = meta.get("updated") or meta.get("generated", "unknown")

    header = (
        "// AUTO-GENERATED — DO NOT EDIT.\n"
        "// Source:      docs/specs/07c_navigation_map.json  (app_shell.sidebar.items[])\n"
        "// Generator:   infra/scripts/regenerate-sidebar.py\n"
        f"// Nav map updated:  {generated_at}\n"
        "//\n"
        "// Sidebar ordering, role gates, labels, and badges live in the nav map.\n"
        "// To change anything here, update the nav map in Nous and re-run the generator.\n"
        "// Regenerate with:  ./infra/scripts/regenerate-sidebar.py\n"
        "\n"
    )
    imports = "import {\n  " + ",\n  ".join(icons) + ",\n  type LucideIcon,\n} from \"lucide-react\";\n\n"

    # IMP-248 / I01 (tsc cleanliness) — `UserRole` was imported from
    # `@/hooks/useAuth`, a module the generator NEVER emits → `tsc` TS2307
    # ("Cannot find module"). `nav-items.gen.ts` is the SOLE referencer of
    # UserRole, so we DEFINE it locally as a deterministic union of the actual
    # nav-map roles (uppercased to the dev-package convention) instead of
    # importing a non-existent hook. Sorted for HR-3 determinism.
    role_set: set[str] = set()
    for it in sidebar_items:
        for r in (it.get("roles") or []):
            if r and r != "all":
                role_set.add(r.upper())
    if role_set:
        user_role = " | ".join(f'"{r}"' for r in sorted(role_set))
    else:
        user_role = "string"
    type_def = (
        "// UserRole — the distinct roles the nav map gates sidebar items on.\n"
        "// Generated locally (the dev team may re-home this in a real auth hook).\n"
        f"export type UserRole = {user_role};\n\n"
        "export interface NavItem {\n"
        "  id: string;\n"
        "  label: string;\n"
        "  labelKey: string;\n"
        "  icon: LucideIcon;\n"
        "  href: string;\n"
        "  screenId: string;\n"
        "  roles?: UserRole[];\n"
        '  /** Key on the API unread-count response — renders a numeric badge when > 0. */\n'
        "  badge?: string;\n"
        '  /** Sidebar placement bucket — "bottom" pins to the foot (e.g. Profile,\n'
        '   *  Admin); "top"/"middle" order within the main list. */\n'
        '  position?: "top" | "middle" | "bottom";\n'
        "}\n\n"
    )

    array = (
        "export const navItems: readonly NavItem[] = [\n"
        + ",\n".join(lines)
        + ",\n] as const;\n"
    )

    return header + imports + type_def + array


def allow_list_payload() -> dict:
    """Canonical allow-list shape: sorted icon list with version stamp."""
    return {
        "version": ALLOW_LIST_VERSION,
        "description": (
            "Lucide icon allow-list — canonical source is the ICON_MAP in "
            "regenerate-sidebar.py. Consumed by Nous/System/spec_parsers/"
            "sidebar_parser.py and ready-check 100 (IMP-137 / HR-30). "
            "DO NOT EDIT BY HAND — regenerated on every regenerate-sidebar.py "
            "invocation."
        ),
        # declared ICON_MAP keys ∪ the generator's unconditional fallback, so a
        # generated nav-items.gen.ts that falls back to FALLBACK_ICON imports
        # only allow-listed icons (IMP-245 / I01 — one derivation point).
        "icons": sorted(set(ICON_MAP.keys()) | {FALLBACK_ICON}),
    }


def allow_list_serialised() -> str:
    return json.dumps(allow_list_payload(), indent=2, ensure_ascii=False) + "\n"


def emit_allow_list(check_mode: bool) -> tuple[bool, bool]:
    """Emit (or check) the allow-list JSON. Returns (changed, ok).

    In writer mode: writes the file when content differs; idempotent.
    In --check mode: returns ok=False if the file is missing or stale.
    """
    new_content = allow_list_serialised()
    if check_mode:
        if not ALLOW_LIST_OUT.exists():
            print(
                f"✗ {ALLOW_LIST_OUT.relative_to(REPO_ROOT)} does not exist — "
                f"run regenerate-sidebar.py to emit it",
                file=sys.stderr,
            )
            return (True, False)
        current = ALLOW_LIST_OUT.read_text(encoding="utf-8")
        if current == new_content:
            return (False, True)
        print(
            f"✗ {ALLOW_LIST_OUT.relative_to(REPO_ROOT)} is OUT OF SYNC "
            f"with regenerate-sidebar.py::ICON_MAP",
            file=sys.stderr,
        )
        return (True, False)

    ALLOW_LIST_OUT.parent.mkdir(parents=True, exist_ok=True)
    current = ALLOW_LIST_OUT.read_text(encoding="utf-8") if ALLOW_LIST_OUT.exists() else ""
    if current == new_content:
        return (False, True)
    ALLOW_LIST_OUT.write_text(new_content, encoding="utf-8")
    return (True, True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate sidebar nav-items.gen.ts from the nav map.")
    parser.add_argument("--check", action="store_true", help="Don't write; exit 1 if file would change")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    nav = load_nav_map()
    new_content = generate_ts(nav)

    if args.check:
        # 1) nav-items.gen.ts in sync
        rc = 0
        if not OUT_FILE.exists():
            print(f"✗ {OUT_FILE} does not exist — run regenerate-sidebar.py (without --check)", file=sys.stderr)
            rc = 1
        else:
            current = OUT_FILE.read_text(encoding="utf-8")
            if current == new_content:
                print(f"✓ {OUT_FILE.name} is in sync with the nav map.")
            else:
                print(f"✗ {OUT_FILE.name} is OUT OF SYNC with the nav map. Run regenerate-sidebar.py.", file=sys.stderr)
                rc = 1
        # 2) allow-list in sync (IMP-137 / I03)
        _, ok = emit_allow_list(check_mode=True)
        if not ok:
            rc = 1
        else:
            print(f"✓ {ALLOW_LIST_OUT.name} is in sync with ICON_MAP.")
        return rc

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(new_content, encoding="utf-8")
    items = nav["app_shell"]["sidebar"]["items"]
    print(f"✓ Wrote {OUT_FILE.relative_to(REPO_ROOT)} ({len(items)} nav items)")
    # Emit allow-list (IMP-137 / I03)
    changed, _ = emit_allow_list(check_mode=False)
    if changed:
        print(f"✓ Wrote {ALLOW_LIST_OUT.relative_to(REPO_ROOT)} ({len(ICON_MAP)} icons)")
    else:
        print(f"  {ALLOW_LIST_OUT.relative_to(REPO_ROOT)} unchanged ({len(ICON_MAP)} icons)")
    if args.verbose:
        for it in items:
            print(f"    {it['id']:<28} {it['route']:<25} roles={it.get('roles', ['all'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
