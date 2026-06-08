"use client";

// IMP-267 / I03 — worked example: consume the @mi-banquito/ui workspace
// package (the @mi-banquito/ui parallel to actions.ts's @mi-banquito/db
// example). The dev team imports real shared components from
// @mi-banquito/ui this way. NOTE: the app-shell chrome under
// components/layout/ legitimately lives in apps/web — it is NOT a
// packages/ui duplicate; packages/ui is the shared component library
// (many entries are typed DoR stubs the dev team fills in).
import { ButtonPrimary } from "@mi-banquito/ui";

export function UiConsumptionExample() {
  return <ButtonPrimary labelKey="common.save" size="md" onPress={() => {}} />;
}
