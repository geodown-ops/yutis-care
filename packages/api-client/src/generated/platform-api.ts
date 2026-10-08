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
    "/platform-api/sign-in-config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 平台後台登入頁的設定
         * @description method=google 時，登入頁以 Firebase Auth SDK（不帶 tenantId）用 Google 帳號登入，之後每個請求帶 Authorization: Bearer <ID token>。
         */
        get: operations["SignInConfigController_get"];
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
    "/platform-api/public/trial-applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 線上申請試用（官網，不需登入）
         * @description 只儲存申請並通知營運與申請人；不會自動開通。公司 Email 不能是免費信箱（free_mail），統一編號須通過檢查碼（invalid_tax_id）。同一個來源每天最多 5 件。
         */
        post: operations["TrialApplicationsController_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/trial-applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 試用申請列表
         * @description 新的在前。status 不給時列出全部。
         */
        get: operations["TrialApplicationsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/trial-applications/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 開通試用申請
         * @description 用審核後的資料開通租戶（同 POST /tenants：建立租戶、金鑰、登入租戶與訂閱，邀請第一位租戶管理員），並把申請標為已開通。
         */
        post: operations["TrialApplicationsController_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/trial-applications/{id}/decline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 婉拒試用申請
         * @description 原因只留在平台內部，不會寄給申請人。
         */
        post: operations["TrialApplicationsController_decline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/payment-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 付款單列表
         * @description 新的在前；可只看一個租戶。
         */
        get: operations["PaymentOrdersController_list"];
        put?: never;
        /**
         * 建立付款單
         * @description 金額由營運填寫（方案的計價參數仍不解讀）。付款後自動新增這一期訂閱（同「續約／新期間」，狀態為啟用），所以開始日要晚於租戶最近一期的開始日。預設寄付款通知信給付款聯絡人。
         */
        post: operations["PaymentOrdersController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/payment-orders/{id}/email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 重寄付款通知信 */
        post: operations["PaymentOrdersController_resend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/payment-orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 取消付款單
         * @description 取消後付款頁不能再付款。
         */
        post: operations["PaymentOrdersController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/payment-orders/{id}/mark-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 標記已付款（匯款入帳）
         * @description 和刷卡付款一樣新增這一期訂閱並寄付款完成信。
         */
        post: operations["PaymentOrdersController_markPaid"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/public/payments/tappay-notify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * TapPay 3D 驗證結果通知（TapPay 伺服器呼叫）
         * @description 一律回 { status: 0 } 讓 TapPay 不再重送。不採信通知內容，只用其中的 order_number 向 TapPay 交易紀錄查詢後才入帳。
         */
        post: operations["PublicPaymentsController_notify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/public/payments/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 付款頁：付款單內容（不需登入） */
        get: operations["PublicPaymentsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/public/payments/{token}/pay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 付款頁：信用卡付款（TapPay Pay by Prime）
         * @description 前端以 TapPay 安全欄位取得 prime 後送來，卡號不經過 Yutis Care。啟用 3D 驗證時回 result=verify 與銀行驗證頁網址。
         */
        post: operations["PublicPaymentsController_pay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/platform-api/public/payments/{token}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 付款頁：3D 驗證回來後確認結果
         * @description 向 TapPay 交易紀錄查詢；已入帳就標為已付款。回傳付款單目前狀態。
         */
        post: operations["PublicPaymentsController_verify"];
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
        SignInConfigDto: {
            /**
             * @description iap：由 Identity-Aware Proxy 把關，不需登入頁；google：以 Firebase Auth SDK 用 Google 帳號登入；dev：本機開發（X-Dev-Platform-User）
             * @enum {string}
             */
            method: "iap" | "google" | "dev";
            /** @description method=google 時：Identity Platform 專案的瀏覽器 API 金鑰（公開值） */
            apiKey?: string;
            /** @description method=google 時：驗證網域，例如 yutis-care-prod.firebaseapp.com */
            authDomain?: string;
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
        TrialApplicationReceivedDto: {
            /** @enum {string} */
            status: "received";
        };
        TrialApplicationDto: {
            /** Format: uuid */
            id: string;
            /**
             * @description 待審核、已開通、已婉拒
             * @enum {string}
             */
            status: "pending" | "approved" | "declined";
            companyName: string;
            /** @description 統一編號 */
            taxId: string;
            /** @enum {string} */
            employeeRange: "1-49" | "50-99" | "100-299" | "300-999" | "1000+";
            contactName: string;
            contactTitle: string;
            email: string;
            phone: string;
            preferredSubdomain: string | null;
            /** @enum {string|null} */
            identityProvider: "microsoft" | "google" | "none" | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            decidedAt: string | null;
            /** @description 審核人 Email */
            decidedBy: string | null;
            /** @description 婉拒原因（內部紀錄，不寄給申請人） */
            declineReason: string | null;
            /**
             * Format: uuid
             * @description 開通後的租戶
             */
            tenantId?: string | null;
        };
        PaymentOrderDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            tenantId: string;
            tenantName: string;
            /** @example YC261008A1B2C3 */
            orderNumber: string;
            /**
             * @description 待付款、已付款、已取消
             * @enum {string}
             */
            status: "pending" | "paid" | "cancelled";
            /** @description 待付款且已過最後付款日 */
            expired: boolean;
            /** @description 新台幣，整數 */
            amount: number;
            description: string;
            planCode: string;
            planName: string;
            seatLimit: number | null;
            /** Format: date */
            periodStartsOn: string;
            /** Format: date */
            periodEndsOn: string | null;
            payerName: string;
            payerEmail: string;
            /** Format: date */
            expiresOn: string;
            /** @description 付款頁連結（官網 /pay/） */
            payUrl: string;
            /**
             * @description 信用卡（TapPay）或匯款（人工標記）
             * @enum {string|null}
             */
            method: "card" | "transfer" | null;
            cardLastFour: string | null;
            /** @description TapPay 交易編號 */
            recTradeId: string | null;
            /** @description 人工標記已付款時的備註 */
            paidNote: string | null;
            /** Format: date-time */
            paidAt: string | null;
            /** @description 付款後已自動新增訂閱期間；已付款但為 false 時，請到租戶頁手動新增 */
            subscriptionAdded: boolean;
            /** Format: date-time */
            createdAt: string;
            /** @description 建立人 Email */
            createdBy: string | null;
            /** @description 這次是否寄出付款通知信（只在建立與重寄時回傳） */
            emailSent?: boolean;
        };
        CardSetupDto: {
            /** @description TapPay App ID（公開值） */
            appId: number;
            /** @description TapPay App Key（公開的前端金鑰） */
            appKey: string;
            /** @enum {string} */
            env: "sandbox" | "production";
        };
        PublicPaymentDto: {
            /** @example YC261008A1B2C3 */
            orderNumber: string;
            /** @description 付款的公司（租戶名稱） */
            tenantName: string;
            description: string;
            /** @description 新台幣，整數 */
            amount: number;
            /**
             * @description 待付款、已付款、已取消、已逾期
             * @enum {string}
             */
            status: "pending" | "paid" | "cancelled" | "expired";
            /**
             * Format: date
             * @description 最後付款日（台灣時間，含當日）
             */
            expiresOn: string;
            /** @description 付款聯絡人，用來預填持卡人 */
            payerName: string;
            payerEmail: string;
            /** Format: date-time */
            paidAt: string | null;
            /** @enum {string|null} */
            method: "card" | "transfer" | null;
            cardLastFour: string | null;
            /** @description 線上刷卡的 TapPay SDK 設定；null 表示未開放刷卡 */
            card: components["schemas"]["CardSetupDto"] | null;
        };
        PayResultDto: {
            /**
             * @description paid：已付款；verify：請把付款人導到 paymentUrl 做 3D 驗證，完成後會回到付款頁（threeds=1）
             * @enum {string}
             */
            result: "paid" | "verify";
            paymentUrl?: string;
            payment: components["schemas"]["PublicPaymentDto"];
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
    SignInConfigController_get: {
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
                    "application/json": components["schemas"]["SignInConfigDto"];
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
    TrialApplicationsController_submit: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    companyName: string;
                    taxId: string;
                    /** @enum {string} */
                    employeeRange: "1-49" | "50-99" | "100-299" | "300-999" | "1000+";
                    contactName: string;
                    contactTitle: string;
                    /** Format: email */
                    email: string;
                    phone: string;
                    preferredSubdomain?: string | null;
                    identityProvider?: ("microsoft" | "google" | "none") | null;
                    /** @constant */
                    consent: true;
                    website?: string;
                    elapsedMs?: number;
                };
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrialApplicationReceivedDto"];
                };
            };
            /** @description validation_failed、free_mail、invalid_tax_id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    TrialApplicationsController_list: {
        parameters: {
            query?: {
                status?: "pending" | "approved" | "declined";
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
                    "application/json": components["schemas"]["TrialApplicationDto"][];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
    TrialApplicationsController_approve: {
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
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrialApplicationDto"];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 申請已處理過（trial_application_decided），或子網域已被使用（subdomain_taken） */
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
    TrialApplicationsController_decline: {
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
                    "application/json": components["schemas"]["TrialApplicationDto"];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 申請已處理過（trial_application_decided） */
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
    PaymentOrdersController_list: {
        parameters: {
            query?: {
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
                    "application/json": components["schemas"]["PaymentOrderDto"][];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
    PaymentOrdersController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    tenantId: string;
                    planCode: string;
                    seatLimit: number | null;
                    /** Format: date */
                    startsOn: string;
                    /** @default null */
                    endsOn?: string | null;
                    amount: number;
                    description?: string;
                    payerName: string;
                    /** Format: email */
                    payerEmail: string;
                    /** Format: date */
                    expiresOn?: string;
                    /** @default true */
                    sendEmail?: boolean;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentOrderDto"];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 開始日沒有晚於最近一期（period_overlap），或租戶已結束（tenant_closed） */
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
    PaymentOrdersController_resend: {
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
                    "application/json": components["schemas"]["PaymentOrderDto"];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 付款單不是待付款（payment_order_closed） */
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
    PaymentOrdersController_cancel: {
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
                    "application/json": components["schemas"]["PaymentOrderDto"];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 付款單不是待付款（payment_order_closed），或付款正在處理（payment_in_progress） */
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
    PaymentOrdersController_markPaid: {
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
                    note: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentOrderDto"];
                };
            };
            /** @description 沒有有效身分（Identity-Aware Proxy，或 Google 登入的 ID token） */
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
            /** @description 付款單不是待付款（payment_order_closed），或付款正在處理（payment_in_progress） */
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
    PublicPaymentsController_notify: {
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
                content?: never;
            };
        };
    };
    PublicPaymentsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
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
                    "application/json": components["schemas"]["PublicPaymentDto"];
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
    PublicPaymentsController_pay: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    prime: string;
                    cardholder: {
                        name: string;
                        /** Format: email */
                        email: string;
                        phoneNumber: string;
                    };
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayResultDto"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 已付款（already_paid）、已取消（order_cancelled）、已逾期（order_expired）、另一筆付款正在處理（payment_in_progress） */
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
    PublicPaymentsController_verify: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
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
                    "application/json": components["schemas"]["PublicPaymentDto"];
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
}
