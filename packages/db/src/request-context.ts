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
  tenantRequestStorage.enterWith(Object.freeze({ ...context }));
}

export function runWithTenantRequestContext<T>(
  context: TenantRequestContext,
  run: () => T,
): T {
  return tenantRequestStorage.run(Object.freeze({ ...context }), run);
}
