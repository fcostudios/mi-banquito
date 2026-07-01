// AUTO-GENERATED — DO NOT EDIT.
// Source:      docs/specs/07c_navigation_map.json  (app_shell.sidebar.items[])
// Generator:   infra/scripts/regenerate-sidebar.py
// Nav map updated:  unknown
//
// Sidebar ordering, role gates, labels, and badges live in the nav map.
// To change anything here, update the nav map in Nous and re-run the generator.
// Regenerate with:  ./infra/scripts/regenerate-sidebar.py

import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Circle,
  FileText,
  HandCoins,
  History,
  Home,
  LineChart,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// UserRole — the distinct roles the nav map gates sidebar items on.
// Generated locally (the dev team may re-home this in a real auth hook).
export type UserRole = "PLATFORM_OPERATOR" | "TESORERA";

export interface NavItem {
  id: string;
  label: string;
  labelKey: string;
  icon: LucideIcon;
  href: string;
  screenId: string;
  roles?: UserRole[];
  /** Key on the API unread-count response — renders a numeric badge when > 0. */
  badge?: string;
  /** Sidebar placement bucket — "bottom" pins to the foot (e.g. Profile,
   *  Admin); "top"/"middle" order within the main list. */
  position?: "top" | "middle" | "bottom";
}

export const navItems: readonly NavItem[] = [
  {
    id: "nav-home",
    label: "Inicio",
    labelKey: "nav.home",
    icon: Home,
    href: "/",
    screenId: "SCR-treasurer-home",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-members",
    label: "Socias",
    labelKey: "nav.members",
    icon: Users,
    href: "/socias",
    screenId: "SCR-members-list",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-contributions",
    label: "Aportes",
    labelKey: "nav.contributions",
    icon: Wallet,
    href: "/aportes",
    screenId: "SCR-contributions-cycle",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-base-fund-quota",
    label: "Cuota base",
    labelKey: "nav.base_fund_quota",
    icon: Banknote,
    href: "/cuota-base/registrar",
    screenId: "SCR-record-base-fund-quota",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-loans",
    label: "Préstamos",
    labelKey: "nav.loans",
    icon: HandCoins,
    href: "/prestamos",
    screenId: "SCR-loans-list",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-arrears",
    label: "Atrasos",
    labelKey: "nav.arrears",
    icon: AlertCircle,
    href: "/atrasos",
    screenId: "SCR-ar-aging",
    roles: ["TESORERA"],
    badge: "{'source': 'alerts_count_severity_high'}",
    position: "top",
  },
  {
    id: "nav-history",
    label: "Historial",
    labelKey: "nav.history",
    icon: History,
    href: "/historial",
    screenId: "SCR-history",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-close",
    label: "Cierre del mes",
    labelKey: "nav.close",
    icon: CheckCircle2,
    href: "/cierre",
    screenId: "SCR-monthly-close",
    roles: ["TESORERA"],
    position: "middle",
  },
  {
    id: "nav-statements",
    label: "Estados de cuenta",
    labelKey: "nav.statements",
    icon: FileText,
    href: "/estados",
    screenId: "SCR-statements-archive",
    roles: ["TESORERA"],
    position: "middle",
  },
  {
    id: "nav-liquidity",
    label: "Liquidez proyectada",
    labelKey: "nav.liquidity",
    icon: LineChart,
    href: "/liquidez",
    screenId: "SCR-cash-flow-projection",
    roles: ["TESORERA"],
    position: "middle",
  },
  {
    id: "nav-share-out",
    label: "Reparto fin de año",
    labelKey: "nav.share_out",
    icon: Circle,
    href: "/reparto",
    screenId: "SCR-year-end-share-out",
    roles: ["TESORERA"],
    position: "middle",
  },
  {
    id: "nav-group",
    label: "Mi grupo",
    labelKey: "nav.group",
    icon: Settings,
    href: "/grupo",
    screenId: "SCR-group-config",
    roles: ["TESORERA"],
    position: "bottom",
  },
  {
    id: "admin-home",
    label: "Inicio",
    labelKey: "nav.admin_home",
    icon: Home,
    href: "/admin",
    screenId: "SCR-admin-home",
    roles: ["PLATFORM_OPERATOR"],
    position: "top",
  },
  {
    id: "admin-orgs-new",
    label: "Nueva organización",
    labelKey: "nav.admin_orgs_new",
    icon: Circle,
    href: "/admin/orgs/new",
    screenId: "SCR-admin-orgs-new",
    roles: ["PLATFORM_OPERATOR"],
    position: "top",
  },
  {
    id: "admin-cron-runs",
    label: "Estado de crons",
    labelKey: "nav.admin_cron_runs",
    icon: Circle,
    href: "/admin/cron-runs",
    screenId: "SCR-admin-cron-runs",
    roles: ["PLATFORM_OPERATOR"],
    position: "top",
  },
  {
    id: "admin-audit",
    label: "Bitácora",
    labelKey: "nav.admin_audit",
    icon: Circle,
    href: "/admin/audit",
    screenId: "SCR-admin-audit",
    roles: ["PLATFORM_OPERATOR"],
    position: "top",
  },
  {
    id: "admin-drift",
    label: "Estado del substrato",
    labelKey: "nav.admin_drift",
    icon: Circle,
    href: "/admin/drift",
    screenId: "SCR-admin-drift",
    roles: ["PLATFORM_OPERATOR"],
    position: "top",
  },
  {
    id: "nav-accounts",
    label: "Cuentas del grupo",
    labelKey: "nav.accounts",
    icon: Banknote,
    href: "/cuentas",
    screenId: "SCR-accounts",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-solidarity",
    label: "Colecta solidaria",
    labelKey: "nav.solidarity",
    icon: HandCoins,
    href: "/colectas",
    screenId: "SCR-solidarity-collection",
    roles: ["TESORERA"],
    position: "top",
  },
  {
    id: "nav-balance",
    label: "Balance del banquito",
    labelKey: "nav.balance",
    icon: Circle,
    href: "/balance",
    screenId: "SCR-balance-banquito",
    roles: ["TESORERA"],
    position: "middle",
  },
] as const;
