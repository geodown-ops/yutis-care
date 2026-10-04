import { createTenantApi } from '@yutis/api-client';

/** The tenant API on this tenant's own domain ({tenant}.care.yutis.net/api). */
export const api = createTenantApi();
