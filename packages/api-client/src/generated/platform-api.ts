/* Generated from apps/platform-api/openapi.json by `pnpm --filter @yutis/api-client generate`. Do not edit. */

export interface paths {
    "/platform-api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 健康檢查（Cloud Run） */
        get: operations["HealthController_health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 目前登入的平台人員與權限 */
        get: operations["MeController_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/tenants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 租戶列表 */
        get: operations["TenantsController_list"];
        put?: never;
        /**
         * 開通租戶
         * @description 建立租戶、租戶金鑰（Cloud KMS）、登入租戶（Identity Platform）與訂閱，複製預設範本，邀請第一位租戶管理員。任一步失敗會清除已建立的部分。
         */
        post: operations["TenantsController_onboard"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/tenants/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 租戶詳情 */
        get: operations["TenantsController_detail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/tenants/{id}/suspend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 停用租戶
         * @description 停用後該租戶的後台與員工端立即無法使用，資料保留。
         */
        post: operations["TenantsController_suspend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/tenants/{id}/reactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 恢復停用的租戶 */
        post: operations["TenantsController_reactivate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/tenants/{id}/subscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * 修改目前的訂閱
         * @description 直接改目前這一期（方案、狀態、人數上限、起訖日），用來更正；沒有訂閱時新增一筆。續約或換方案請用 POST /tenants/{id}/subscriptions，訂閱歷史才會保留。目前不依此收費。
         */
        put: operations["TenantsController_setSubscription"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/tenants/{id}/subscriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 新增訂閱期間（續約、換方案）
         * @description 新增一期，舊的留在訂閱歷史；開始日一到就成為目前的訂閱，所以可以在這期結束前先續約。新的一期要晚於最近一期的開始日；最近一期沒有結束日、或結束日不早於新期間開始日時，結束日改為新期間開始的前一天。目前不依此收費。
         */
        post: operations["TenantsController_addPeriod"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 方案列表 */
        get: operations["PlansUsageController_listPlans"];
        put?: never;
        /**
         * 新增方案
         * @description 四大計畫不拆賣：方案只差在人數與計價，不開關功能。
         */
        post: operations["PlansUsageController_createPlan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/plans/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * 修改或停用方案
         * @description 代碼不能改。停用的方案不能再用於開通或新的訂閱期間，已在使用的訂閱不受影響。
         */
        patch: operations["PlansUsageController_updatePlan"];
        trace?: never;
    };
    "/platform-api/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 各租戶用量（只有計數）
         * @description 員工與帳號數為目前值；健檢與簡訊為指定月份。平台拿不到任何一筆明細。
         */
        get: operations["PlansUsageController_usage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/announcements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 公告列表（新的在前） */
        get: operations["AnnouncementsController_list"];
        put?: never;
        /** 新增公告 */
        post: operations["AnnouncementsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/announcements/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** 刪除公告 */
        delete: operations["AnnouncementsController_remove"];
        options?: never;
        head?: never;
        /** 修改公告 */
        patch: operations["AnnouncementsController_update"];
        trace?: never;
    };
    "/platform-api/platform-users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 平台人員 */
        get: operations["PlatformUsersController_list"];
        put?: never;
        /**
         * 新增平台人員
         * @description 還需要在 Identity-Aware Proxy 加入此帳號才能登入。
         */
        post: operations["PlatformUsersController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/platform-users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 修改平台人員（角色、停用） */
        patch: operations["PlatformUsersController_update"];
        trace?: never;
    };
    "/platform-api/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 目前生效的預設範本版本
         * @description 新租戶開通時複製：分級規則、片語庫、簽核角色、問卷版本。
         */
        get: operations["TemplatesController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/templates/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 把預設範本更新為程式內建的版本
         * @description 內容有變的類別會發布新版本；已開通的租戶不受影響。
         */
        post: operations["TemplatesController_sync"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 平台稽核紀錄
         * @description 平台後台的所有變更，新的在前。日期為台灣時間，含起訖兩天。
         */
        get: operations["PlatformAuditController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        HealthDto: {
            /** @enum {string} */
            status: "ok";
        };
        PlatformMeDto: {
            /** Format: uuid */
            id: string;
            email: string;
            name: string;
            /** @enum {string} */
            role: "營運" | "客服" | "工程";
            /** @description 這個角色能做的事；畫面依此隱藏按鈕（API 仍會逐一檢查） */
            permissions: ("tenants:read" | "tenants:write" | "subscriptions:write" | "announcements:write" | "templates:write" | "platform-users:manage" | "audit:read")[];
        };
        ApiErrorDto: {
            /** @example 403 */
            status: number;
            /**
             * @description 機器可判讀的錯誤代碼，例如 unknown_tenant、tenant_inactive、unauthorized、forbidden、outside_sites、cross_origin、validation_failed、sign_in_unavailable
             * @example forbidden
             */
            code: string;
            /** @description 給開發者看的說明，不直接顯示給使用者 */
            message: string;
        };
        SubscriptionDto: {
            planCode: string;
            planName: string;
            /**
             * @description 試用、啟用、逾期、解約
             * @enum {string}
             */
            status: "trial" | "active" | "past_due" | "cancelled";
            /** @description 人數上限；超過只提醒、不阻擋 */
            seatLimit: number | null;
            /** Format: date */
            startsOn: string;
            /** Format: date */
            endsOn: string | null;
        };
        TenantDto: {
            /** Format: uuid */
            id: string;
            /** @example acme */
            subdomain: string;
            /** @example https://acme.care.yutis.com.tw */
            url: string;
            name: string;
            /** @enum {string} */
            status: "active" | "suspended" | "closed";
            /** Format: date-time */
            createdAt: string;
            /** @description 目前的訂閱：已開始的最新一期（都還沒開始時為最早的一期） */
            subscription: components["schemas"]["SubscriptionDto"] | null;
            /** @description 在職員工數（資料庫函式計算，平台看不到明細） */
            activeEmployees: number;
            /** @description 啟用中的後台帳號數 */
            staffAccounts: number;
            /** @description 在職員工數超過人數上限 */
            overSeatLimit: boolean;
        };
        TenantAdminDto: {
            name: string;
            email: string;
            active: boolean;
            /** Format: date-time */
            lastSignInAt: string | null;
        };
        TenantDetailDto: {
            /** Format: uuid */
            id: string;
            /** @example acme */
            subdomain: string;
            /** @example https://acme.care.yutis.com.tw */
            url: string;
            name: string;
            /** @enum {string} */
            status: "active" | "suspended" | "closed";
            /** Format: date-time */
            createdAt: string;
            /** @description 目前的訂閱：已開始的最新一期（都還沒開始時為最早的一期） */
            subscription: components["schemas"]["SubscriptionDto"] | null;
            /** @description 在職員工數（資料庫函式計算，平台看不到明細） */
            activeEmployees: number;
            /** @description 啟用中的後台帳號數 */
            staffAccounts: number;
            /** @description 在職員工數超過人數上限 */
            overSeatLimit: boolean;
            /** @description 已建立租戶金鑰（Cloud KMS） */
            encryptionKeyReady: boolean;
            /** @description 已建立登入租戶（Identity Platform） */
            signInTenantReady: boolean;
            /** @description 訂閱歷史，新的在前 */
            subscriptions: components["schemas"]["SubscriptionDto"][];
            /** @description 租戶管理員名單（由資料庫函式提供，平台讀不到帳號表） */
            admins: components["schemas"]["TenantAdminDto"][];
        };
        PlanDto: {
            /** Format: uuid */
            id: string;
            /** @example standard */
            code: string;
            /** @example 標準方案 */
            name: string;
            /** @description 計價參數；計費模式定案前不解讀 */
            pricing: {
                [key: string]: unknown;
            };
            active: boolean;
        };
        UsageDto: {
            /** Format: uuid */
            tenantId: string;
            subdomain: string;
            name: string;
            /** @description 在職員工數（目前） */
            activeEmployees: number;
            /** @description 啟用中的後台帳號數（目前） */
            staffAccounts: number;
            /** @description 該月健檢筆數 */
            examsInMonth: number;
            /** @description 該月簡訊則數（由營運商負擔，按租戶記錄） */
            smsSent: number;
            seatLimit: number | null;
            overSeatLimit: boolean;
        };
        AnnouncementDto: {
            /** Format: uuid */
            id: string;
            /**
             * Format: uuid
             * @description null 表示所有租戶
             */
            tenantId: string | null;
            /**
             * @description 維護、新功能、一般公告
             * @enum {string}
             */
            kind: "maintenance" | "feature" | "notice";
            title: string;
            body: string;
            /** Format: date-time */
            publishAt: string;
            /** Format: date-time */
            expiresAt: string | null;
        };
        PlatformUserDto: {
            /** Format: uuid */
            id: string;
            email: string;
            name: string;
            /** @enum {string} */
            role: "營運" | "客服" | "工程";
            active: boolean;
        };
        TemplateVersionDto: {
            /** @enum {string} */
            kind: "grading_rules" | "phrases" | "sign_off_roles" | "survey_versions";
            version: number;
            /** @description 這次是否發布了新版本 */
            changed: boolean;
        };
        PlatformAuditActorDto: {
            /** Format: uuid */
            id: string | null;
            email: string;
            /** @description 平台人員已刪除時為 null */
            name: string | null;
        };
        PlatformAuditTenantDto: {
            /** Format: uuid */
            id: string;
            subdomain: string;
            name: string;
        };
        PlatformAuditEntryDto: {
            id: number;
            /** Format: date-time */
            at: string;
            actor: components["schemas"]["PlatformAuditActorDto"];
            /**
             * @description 例如 tenant.onboard、tenant.suspend、subscription.renew、plan.update、announcement.create
             * @example tenant.suspend
             */
            action: string;
            tenant: components["schemas"]["PlatformAuditTenantDto"] | null;
            subjectTable: string | null;
            subjectId: string | null;
            /** @description 改了什麼；不含任何租戶員工資料 */
            detail: {
                [key: string]: unknown;
            } | null;
            ip: string | null;
        };
        PlatformAuditPageDto: {
            /** @description 符合條件的總筆數 */
            total: number;
            /** @description 新的在前 */
            items: components["schemas"]["PlatformAuditEntryDto"][];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    HealthController_health: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthDto"];
                };
            };
        };
    };
    MeController_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformMeDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user） */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TenantsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantDto"][];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TenantsController_onboard: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    subdomain: string;
                    name: string;
                    planCode: string;
                    /**
                     * @default trial
                     * @enum {string}
                     */
                    subscriptionStatus?: "trial" | "active";
                    /** @default null */
                    seatLimit?: number | null;
                    /** Format: date */
                    startsOn?: string;
                    /** @default null */
                    endsOn?: string | null;
                    admin: {
                        /** Format: email */
                        email: string;
                        name: string;
                    };
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantDetailDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 子網域已被使用（subdomain_taken），或尚未建立預設範本（templates_missing） */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TenantsController_detail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantDetailDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TenantsController_suspend: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    reason: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantDetailDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TenantsController_reactivate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantDetailDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TenantsController_setSubscription: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    planCode: string;
                    /** @enum {string} */
                    status: "trial" | "active" | "past_due" | "cancelled";
                    seatLimit: number | null;
                    /** Format: date */
                    startsOn: string;
                    endsOn: string | null;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantDetailDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TenantsController_addPeriod: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    planCode: string;
                    /**
                     * @default active
                     * @enum {string}
                     */
                    status?: "trial" | "active" | "past_due" | "cancelled";
                    seatLimit: number | null;
                    /** Format: date */
                    startsOn: string;
                    /** @default null */
                    endsOn?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantDetailDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 新期間沒有晚於最近一期的開始日（period_overlap） */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlansUsageController_listPlans: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanDto"][];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlansUsageController_createPlan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    name: string;
                    /** @default {} */
                    pricing?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlansUsageController_updatePlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    pricing?: {
                        [key: string]: unknown;
                    };
                    active?: boolean;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlansUsageController_usage: {
        parameters: {
            query?: {
                /** @description 年月 YYYY-MM，預設本月 */
                month?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsageDto"][];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    AnnouncementsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnnouncementDto"][];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    AnnouncementsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default null */
                    tenantId?: string | null;
                    /**
                     * @default notice
                     * @enum {string}
                     */
                    kind?: "maintenance" | "feature" | "notice";
                    title: string;
                    body: string;
                    /** Format: date-time */
                    publishAt?: string;
                    expiresAt?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnnouncementDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    AnnouncementsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    AnnouncementsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    tenantId?: string | null;
                    /** @enum {string} */
                    kind?: "maintenance" | "feature" | "notice";
                    title?: string;
                    body?: string;
                    /** Format: date-time */
                    publishAt?: string;
                    expiresAt?: string | null;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnnouncementDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlatformUsersController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformUserDto"][];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlatformUsersController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    name: string;
                    /** @enum {string} */
                    role: "營運" | "客服" | "工程";
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformUserDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlatformUsersController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** @enum {string} */
                    role?: "營運" | "客服" | "工程";
                    active?: boolean;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformUserDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TemplatesController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TemplateVersionDto"][];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TemplatesController_sync: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TemplateVersionDto"][];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    PlatformAuditController_list: {
        parameters: {
            query?: {
                /** @description 略過的筆數，預設 0 */
                offset?: number;
                /** @description 每頁筆數，預設 50，最多 200 */
                limit?: number;
                to?: string;
                from?: string;
                action?: string;
                /** @description 只看這位平台人員的操作 */
                actorId?: string;
                /** @description 只看對這個租戶的操作 */
                tenantId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlatformAuditPageDto"];
                };
            };
            /** @description 沒有經過 Identity-Aware Proxy 的有效身分 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 不是平台人員（not_platform_user），或角色沒有此權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
}
