import { AsyncLocalStorage } from "node:async_hooks";

export type TenantRequestContext = {
  readOnly: boolean;
  orgId?: string;
  operatorId?: string;
};

const writableDefault: TenantRequestContext = Object.freeze({ readOnly: false });
const tenantRequestStorage = new AsyncLocalStorage<TenantRequestContext>();

export function getTenantRequestContext(): TenantRequestContext {
  return tenantRequestStorage.getStore() ?? writableDefault;
}

export function establishTenantRequestContext(context: TenantRequestContext): void {
  const active = tenantRequestStorage.getStore();
  if (active) {
    Object.assign(active, context);
    return;
  }
  tenantRequestStorage.enterWith({ ...context });
}

export function initializeTenantRequestContext(): void {
  tenantRequestStorage.enterWith({ readOnly: false });
}

export function runWithTenantRequestContext<T>(
  context: TenantRequestContext,
  run: () => T,
): T {
  return tenantRequestStorage.run({ ...context }, run);
}
