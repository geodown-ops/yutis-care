/* Generated from apps/api/openapi.json by `pnpm --filter @yutis/api-client generate`. Do not edit. */

export interface paths {
    "/api/tenant": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 網址子網域對應的租戶
         * @description 前端啟動時呼叫，登入前即可使用。
         */
        get: operations["TenantController_tenant"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 健康檢查（Cloud Run） */
        get: operations["TenantController_health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 目前登入者、角色、負責廠區與可用功能 */
        get: operations["MeController_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 登入：以登入服務的 ID token 換取 session cookie
         * @description 後台人員須已被租戶管理員邀請；第一次登入時綁定登入服務的帳號。員工以 Email 或手機對應員工主檔。
         */
        post: operations["AuthController_signIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 登出 */
        post: operations["AuthController_signOut"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/org": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 組織架構（法人 → 廠區 → 部門） */
        get: operations["OrgController_tree"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/org/legal-entities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 新增法人 */
        post: operations["OrgController_createLegalEntity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/org/legal-entities/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** 刪除法人（沒有廠區與員工時） */
        delete: operations["OrgController_deleteLegalEntity"];
        options?: never;
        head?: never;
        /** 修改法人 */
        patch: operations["OrgController_updateLegalEntity"];
        trace?: never;
    };
    "/api/admin/org/sites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 新增廠區 */
        post: operations["OrgController_createSite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/org/sites/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** 刪除廠區（沒有部門、員工與負責人員時） */
        delete: operations["OrgController_deleteSite"];
        options?: never;
        head?: never;
        /** 修改廠區 */
        patch: operations["OrgController_updateSite"];
        trace?: never;
    };
    "/api/admin/org/departments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 新增部門 */
        post: operations["OrgController_createDepartment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/org/departments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** 刪除部門（沒有員工時） */
        delete: operations["OrgController_deleteDepartment"];
        options?: never;
        head?: never;
        /** 修改部門 */
        patch: operations["OrgController_updateDepartment"];
        trace?: never;
    };
    "/api/admin/org/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 以 Excel 匯入組織
         * @description 工作表「法人」（代碼、名稱）、「廠區」（代碼、名稱、法人代碼、地址）、「部門」（廠區代碼、名稱、代碼、主管姓名、主管Email、主管電話）。依代碼（部門依廠區＋名稱）新增或更新，不刪除。預設只預覽；加 commit=true 才寫入，有任何錯誤列就整份不寫入。
         */
        post: operations["OrgController_import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 後台人員帳號 */
        get: operations["UsersController_list"];
        put?: never;
        /**
         * 邀請後台人員
         * @description 指定角色與負責廠區；對方以公司帳號（SSO）或本地帳號第一次登入時綁定。只有被邀請的人能登入。
         */
        post: operations["UsersController_invite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/users/{id}": {
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
         * 修改後台人員：角色、負責廠區、停用
         * @description 停用會立即登出該人員。不能停用自己或改自己的角色，也不能讓租戶沒有啟用中的租戶管理員。
         */
        patch: operations["UsersController_update"];
        trace?: never;
    };
    "/api/admin/employees/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 以 Excel 匯入員工主檔
         * @description 第一個工作表，第一列為欄位名稱。必填：工號、姓名、性別、出生日期、法人代碼、廠區代碼、部門；選填：身分證字號、職稱、班別、健檢類別、特殊作業、語言、到職日、Email、手機、狀態。依工號新增或更新（檔案裡沒有的員工不會被刪除；離職請填狀態）。組織需先建立。預設只預覽；加 commit=true 才寫入，有任何錯誤列就整份不寫入。超過人數上限只提醒。
         */
        post: operations["EmployeesController_import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/exam-mappings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 健檢匯入對照 */
        get: operations["ExamSettingsController_listMappings"];
        put?: never;
        /** 新增健檢醫院的欄位對照 */
        post: operations["ExamSettingsController_createMapping"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/exam-mappings/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 修改欄位對照 */
        put: operations["ExamSettingsController_updateMapping"];
        post?: never;
        /** 刪除欄位對照 */
        delete: operations["ExamSettingsController_deleteMapping"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/rule-sets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 分級標準版本 */
        get: operations["ExamSettingsController_listRuleSets"];
        put?: never;
        /**
         * 建立新版分級標準（草稿）
         * @description 送出整套規則；發布前不影響分級。
         */
        post: operations["ExamSettingsController_createRuleSet"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/rule-sets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 某一版分級標準的規則 */
        get: operations["ExamSettingsController_ruleSet"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/rule-sets/{id}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 發布分級標準
         * @description 之後匯入的健檢依此版本分級；先前的結果保留原版本。
         */
        post: operations["ExamSettingsController_publish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/exams/mappings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 可用的健檢匯入對照（匯入時選擇） */
        get: operations["ExamsController_mappings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/exams/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 匯入健檢結果
         * @description 依選定醫院的欄位對照讀取第一個工作表，以工號或身分證字號對應員工（只能匯入負責廠區的員工），依目前發布的分級標準分級，最高分級 3 級以上或特殊健檢 2 級以上產生異常事件。預設只預覽；加 commit=true 才寫入，有任何錯誤列就整份不寫入。
         */
        post: operations["ExamsController_import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/employees/{employeeId}/exams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 員工的健檢歷史（新的在前）
         * @description 不含病史、症狀等醫療文字；每次讀取都記入稽核。
         */
        get: operations["ExamsController_history"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/exams/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 單次健檢（含病史、症狀等醫療文字）
         * @description 醫療文字只解密給可見醫療資料的角色；讀取記入稽核。
         */
        get: operations["ExamsController_detail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/phrases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 片語庫
         * @description 撰寫協助紀錄、措施時插入的常用片語。
         */
        get: operations["RecordsController_listPhrases"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/employees/{employeeId}/records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 員工的協助紀錄（新的在前）
         * @description 內容解密後回傳；每次讀取記入稽核。
         */
        get: operations["RecordsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/records/follow-ups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 我的待追蹤
         * @description 指派給我、尚未完成的追蹤（不含紀錄內容）。
         */
        get: operations["RecordsController_followUps"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 新增協助紀錄 */
        post: operations["RecordsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/records/{id}": {
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
        /** 修改協助紀錄（含完成追蹤） */
        patch: operations["RecordsController_update"];
        trace?: never;
    };
    "/api/admin/phrases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 新增片語 */
        post: operations["RecordsController_createPhrase"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/phrases/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** 刪除片語 */
        delete: operations["RecordsController_deletePhrase"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 個案列表：負責廠區內有異常事件的員工
         * @description 每位列出的員工都記入稽核。
         */
        get: operations["CasesController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cases/age-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 更新年齡關注事件
         * @description 未滿 18 歲或已達中高齡（55 歲）的在職員工各產生一個事件；已有的不重複產生。員工匯入後也會自動執行。
         */
        post: operations["CasesController_ageEvents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/employees/{employeeId}/case": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 員工的個案服務單：事件、個案與狀態歷程 */
        get: operations["CasesController_detail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/employees/{employeeId}/case/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 開單
         * @description 沒有個案或個案已結案時，開一張新的個案（起單，主責為自己）；個案進行中時，把新進的未開單事件併入。
         */
        post: operations["CasesController_open"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cases/{id}": {
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
         * 更新個案：狀態（處理中、結案）、主責、各日期
         * @description 狀態只能依 起單 → 處理中 → 結案 前進；個案內的事件跟著變更並留下歷程。
         */
        patch: operations["CasesController_update"];
        trace?: never;
    };
    "/api/programs/ergo/dispatches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** NMQ 發送批次（只有計數） */
        get: operations["ErgoController_dispatches"];
        put?: never;
        /**
         * 發送 NMQ 問卷
         * @description 員工在員工端看到待填問卷；也可由職護代填。
         */
        post: operations["ErgoController_dispatch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/ergo/dispatches/{id}/surveys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 批次內負責廠區員工的填答狀況與結果
         * @description 每位列出的員工都記入稽核。
         */
        get: operations["ErgoController_surveys"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/ergo/surveys/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 職護代填 NMQ（依員工口述） */
        put: operations["ErgoController_fill"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/workload/assessments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 負責廠區的過勞評估
         * @description 每位列出的員工都記入稽核；面談紀錄另以單筆查詢。
         */
        get: operations["WorkloadController_all"];
        put?: never;
        /**
         * 發送過勞量表與工時調查
         * @description 員工在員工端填寫 CBI 與加班時數；也可由職護代填。
         */
        post: operations["WorkloadController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/workload/assessments/{id}/fatigue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 過勞量表：CBI 作答或直接輸入分數（匯入結果） */
        put: operations["WorkloadController_fatigue"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/workload/assessments/{id}/overload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 工時與工作型態 */
        put: operations["WorkloadController_overload"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/workload/assessments/{id}/interview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * 醫師面談與健康指導
         * @description 面談紀錄加密；工作安排建議可通知人資與主管。
         */
        put: operations["WorkloadController_interview"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/maternal/env-assessments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 負責廠區的母性健康危害評估 */
        get: operations["MaternalViolenceController_envs"];
        put?: never;
        /**
         * 母性健康危害評估（作業環境）
         * @description 依危害有無自動建議管理分級。職安衛人員與職護、職醫。
         */
        post: operations["MaternalViolenceController_createEnv"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/maternal/cases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 負責廠區的母性健康保護個案
         * @description 每位列出的員工都記入稽核。
         */
        get: operations["MaternalViolenceController_maternal"];
        put?: never;
        /**
         * 母性健康保護通報（妊娠、產後）
         * @description 產生母性事件，進入個案管理。
         */
        post: operations["MaternalViolenceController_createMaternal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/maternal/cases/{id}/interviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 母性健康保護面談
         * @description 面談紀錄加密；適性評估與工作調整送交員工在員工端確認。
         */
        post: operations["MaternalViolenceController_interview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/violence/risk-assessments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 負責廠區的不法侵害風險評估 */
        get: operations["MaternalViolenceController_risks"];
        put?: never;
        /**
         * 不法侵害危害辨識及風險評估
         * @description 可能性 × 嚴重度自動算出風險等級。
         */
        post: operations["MaternalViolenceController_createRisk"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/violence/checklists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 負責廠區的檢點表 */
        get: operations["MaternalViolenceController_checklists"];
        put?: never;
        /** 作業場所與人力檢點表 */
        post: operations["MaternalViolenceController_createChecklist"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/violence/incidents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 負責廠區的不法侵害事件 */
        get: operations["MaternalViolenceController_incidents"];
        put?: never;
        /**
         * 不法侵害事件通報
         * @description 事件細節加密；只有職護、職醫看得到，主管一律不可見。
         */
        post: operations["MaternalViolenceController_createIncident"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/work-advice": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 工作安排建議
         * @description 負責廠區員工的面談後工作安排建議，給人資執行；不含任何健康或醫療內容。
         */
        get: operations["AdviceController_workAdvice"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/notices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 我收到的工作安排通知（部門主管）
         * @description 只列出通知給自己的；讀取後標記已讀。
         */
        get: operations["AdviceController_myNotices"];
        put?: never;
        /**
         * 通知部門主管工作安排建議
         * @description 主管只會看到這段建議文字。
         */
        post: operations["AdviceController_notify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/programs/acknowledgements/{id}/link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 產生員工確認連結
         * @description 一次性、14 天內有效，只能開啟這一份紀錄；重新產生會讓舊連結失效。連結只回傳這一次，資料庫只存雜湊；同時排入寄給員工的通知信（信中不含健康內容）。
         */
        post: operations["AdviceController_link"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 我的基本資料 */
        get: operations["PortalController_profile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 我的待辦：待填問卷與待確認紀錄 */
        get: operations["PortalController_tasks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/ergo/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 填寫 NMQ 問卷 */
        put: operations["PortalController_nmq"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/workload/{id}/cbi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 填寫過勞量表（CBI） */
        put: operations["PortalController_cbi"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/workload/{id}/overload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 填寫工時與工作型態 */
        put: operations["PortalController_overload"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/acknowledgements/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 要我確認的紀錄 */
        get: operations["PortalController_acknowledgement"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/acknowledgements/{id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 確認紀錄 */
        post: operations["PortalController_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 我的健康資料
         * @description 個資法第 3 條的查詢、閱覽權利。
         */
        get: operations["PortalController_health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/health/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 匯出我的健康資料
         * @description 個資法第 3 條的製給複本權利；記入稽核。
         */
        get: operations["PortalController_export"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/consents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 我的告知聲明閱讀與同意紀錄 */
        get: operations["PortalController_consents"];
        put?: never;
        /** 記錄已閱讀告知聲明或同意非法定用途 */
        post: operations["PortalController_give"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/portal/consents/{id}/withdraw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 撤回同意 */
        post: operations["PortalController_withdraw"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sign/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 以一次性連結開啟要確認或簽核的紀錄
         * @description 開啟不會讓連結失效；確認或簽核後才失效。
         */
        get: operations["SignController_open"];
        put?: never;
        /**
         * 以一次性連結確認或簽核
         * @description 完成後連結立即失效，不能再用。附表八所有簽核人員都簽核後，紀錄狀態變為已完成。
         */
        post: operations["SignController_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/service-records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 負責廠區的附表八紀錄 */
        get: operations["ServiceRecordsController_list"];
        put?: never;
        /**
         * 新增附表八紀錄（草稿）
         * @description 簽核人員的角色必須是租戶設定的簽核角色之一。
         */
        post: operations["ServiceRecordsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/service-records/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** 修改草稿 */
        put: operations["ServiceRecordsController_update"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/service-records/{id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 送出簽核
         * @description 每位簽核人員各一個一次性連結（14 天內有效），並排入通知信；連結只回傳這一次。
         */
        post: operations["ServiceRecordsController_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/service-records/{id}/signatures/{signatureId}/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 重寄簽核連結
         * @description 舊連結隨即失效。
         */
        post: operations["ServiceRecordsController_resend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 報表類型（健檢 7、異常工作負荷 6、人因 3） */
        get: operations["ReportsController_types"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reports/{kind}/{type}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 統計報表
         * @description 負責廠區內的員工，可再依法人、廠區、部門篩選。職安衛人員與人資只看去識別統計：少於 5 人的格子（及可由它推算的格子）不顯示。
         */
        get: operations["ReportsController_report"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/exports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 我的匯出 */
        get: operations["ReportsController_myExports"];
        put?: never;
        /**
         * 匯出報表（Excel 或 PDF）
         * @description 由背景工作產生，完成後以短效連結下載；檔案有匯出人與時間浮水印，內容與畫面上看到的相同（含去識別）。
         */
        post: operations["ReportsController_requestExport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/exports/{id}/link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 取得下載連結
         * @description 5 分鐘內有效、只能下載一次；只有匯出的人可以取得。
         */
        post: operations["ReportsController_link"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/exports/download/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 下載匯出檔（短效、一次性連結） */
        get: operations["ReportsController_download"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/retention": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 已過保存期限、待人工確認刪除的資料
         * @description 由背景工作每晚掃描；系統不會自動刪除。
         */
        get: operations["RetentionController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/retention/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 立即掃描此租戶
         * @description 與每晚的背景工作相同，只列出，不刪除。
         */
        post: operations["RetentionController_scan"];
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
        TenantDto: {
            /** Format: uuid */
            id: string;
            /**
             * @description 公司名稱
             * @example 範例股份有限公司
             */
            name: string;
            /**
             * @description 子網域
             * @example acme
             */
            subdomain: string;
            /** @description 公司 Logo；尚未設定時為 null */
            logoUrl: string | null;
            /** @description 登入頁要顯示的登入方式；dev 只在本機開發模式出現 */
            loginMethods: ("sso" | "password" | "sms" | "email_otp" | "dev")[];
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
        HealthDto: {
            /** @enum {string} */
            status: "ok";
        };
        SiteDto: {
            /** Format: uuid */
            id: string;
            /** @example S1 */
            code: string;
            /** @example 桃園廠 */
            name: string;
        };
        BreakGlassSiteDto: {
            /** Format: uuid */
            id: string;
            /** @example S1 */
            code: string;
            /** @example 桃園廠 */
            name: string;
            /** Format: date-time */
            expiresAt: string;
        };
        StaffMeDto: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "staff";
            /** Format: uuid */
            id: string;
            name: string;
            email: string;
            /** @enum {string} */
            role: "職護" | "職醫" | "職安衛人員" | "人資" | "部門主管" | "租戶管理員";
            /** @description 負責廠區 */
            sites: components["schemas"]["SiteDto"][];
            /** @description 有效的破窗存取授權 */
            breakGlassSites: components["schemas"]["BreakGlassSiteDto"][];
            /** @description 角色可見的資料敏感等級 */
            dataCategories: ("identity" | "work" | "health" | "medical")[];
            /** @description 可用功能；前端據此顯示選單，實際權限由後端檢查 */
            features: ("nurse-home" | "employees" | "cases" | "programs" | "service-records" | "reports" | "tenant-admin")[];
        };
        EmployeeMeDto: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "employee";
            /** Format: uuid */
            id: string;
            name: string;
            /** @description 員工端語言：zh、en、ja、vi、th */
            lang: string;
        };
        LegalEntityDto: {
            /** Format: uuid */
            id: string;
            code: string;
            name: string;
            sites: components["schemas"]["SiteDto"][];
        };
        CreatedDto: {
            /** Format: uuid */
            id: string;
        };
        ImportIssueDto: {
            /** @example 員工 */
            sheet?: string;
            /**
             * @description Excel 列號
             * @example 7
             */
            row: number;
            /** @example 出生日期 */
            column?: string;
            /** @example 日期格式應為 YYYY-MM-DD */
            message: string;
        };
        ImportCountsDto: {
            create: number;
            update: number;
            unchanged: number;
        };
        OrgImportReportDto: {
            /** @description 是否已寫入；預覽（未加 commit=true）或有錯誤時為 false */
            committed: boolean;
            /** @description 有任何一列錯誤就整份不匯入 */
            issues: components["schemas"]["ImportIssueDto"][];
            legalEntities: components["schemas"]["ImportCountsDto"];
            sites: components["schemas"]["ImportCountsDto"];
            departments: components["schemas"]["ImportCountsDto"];
        };
        StaffAccountDto: {
            /** Format: uuid */
            id: string;
            email: string;
            name: string;
            /** @enum {string} */
            role: "職護" | "職醫" | "職安衛人員" | "人資" | "部門主管" | "租戶管理員";
            phone: string | null;
            /** @description 勞工健康服務人員資格 */
            qualification: string | null;
            active: boolean;
            /** @description 已用公司帳號（SSO）登入過；未登入過表示邀請尚未接受 */
            signedInBefore: boolean;
            /** Format: date-time */
            lastSignInAt: string | null;
            /** @description 負責廠區 */
            siteIds: string[];
        };
        SeatsDto: {
            /** @description 匯入後的在職員工數 */
            activeEmployees: number;
            /** @description 訂閱的人數上限 */
            seatLimit: number | null;
            /** @description 超過人數上限（只提醒，不阻擋匯入） */
            overLimit: boolean;
        };
        EmployeeImportReportDto: {
            /** @description 是否已寫入；預覽（未加 commit=true）或有錯誤時為 false */
            committed: boolean;
            /** @description 資料列數 */
            rows: number;
            create: number;
            update: number;
            unchanged: number;
            /** @description 有任何一列錯誤就整份不匯入 */
            issues: components["schemas"]["ImportIssueDto"][];
            seats: components["schemas"]["SeatsDto"];
        };
        ExamMappingDto: {
            /** Format: uuid */
            id: string;
            /** @example 仁安健康管理診所 */
            clinic: string;
            /** @description 欄位對照：columns（工號或身分證字號、檢查日期…）與 items（項目代碼 → Excel 欄名） */
            mapping: {
                [key: string]: unknown;
            };
        };
        RuleSetDto: {
            /** Format: uuid */
            id: string;
            version: number;
            /** @enum {string} */
            status: "draft" | "published" | "retired";
            /** Format: date */
            effectiveFrom: string | null;
            note: string | null;
        };
        RuleSetDetailDto: {
            /** Format: uuid */
            id: string;
            version: number;
            /** @enum {string} */
            status: "draft" | "published" | "retired";
            /** Format: date */
            effectiveFrom: string | null;
            note: string | null;
            /** @description 與 @yutis/domain GradingRule 相同格式 */
            rules: {
                [key: string]: unknown;
            }[];
        };
        ExamImportReportDto: {
            committed: boolean;
            rows: number;
            /** @description 可匯入的健檢筆數 */
            exams: number;
            issues: components["schemas"]["ImportIssueDto"][];
            /** @description 分級依據的版本 */
            ruleSetVersion: number;
            /** @description 最高分級 3 級以上的人數 */
            grade3Plus: number;
            /** @description 寫入後新產生的異常事件數（預覽時為預估） */
            newEvents: number;
        };
        ExamItemDto: {
            /** @example B0111 */
            code: string;
            /** @example 血壓－收縮壓 */
            name: string;
            /** @example mmHg */
            unit: string;
            /** @description 數值或文字結果 */
            value: string | null;
            /** @description 分級 1–4；沒有對應規則時為 null */
            grade: number | null;
        };
        ExamSummaryDto: {
            /** Format: uuid */
            id: string;
            /** Format: date */
            examDate: string;
            clinic: string | null;
            kind: string;
            /** @description 各項分級加總 */
            gradeTotal: number;
            /** @description 最高分級 */
            gradeMax: number;
            /** @description 分級所依據的分級標準版本 */
            ruleSetVersion: number;
            specialHazard: string | null;
            /** @description 特殊健檢管理分級 */
            specialLevel: number | null;
            smoker: boolean | null;
            items: components["schemas"]["ExamItemDto"][];
        };
        ExamDetailDto: {
            /** Format: uuid */
            id: string;
            /** Format: date */
            examDate: string;
            clinic: string | null;
            kind: string;
            /** @description 各項分級加總 */
            gradeTotal: number;
            /** @description 最高分級 */
            gradeMax: number;
            /** @description 分級所依據的分級標準版本 */
            ruleSetVersion: number;
            specialHazard: string | null;
            /** @description 特殊健檢管理分級 */
            specialLevel: number | null;
            smoker: boolean | null;
            items: components["schemas"]["ExamItemDto"][];
            /** @description 病史（醫療資料，只給職護、職醫） */
            history: string | null;
            /** @description 自覺症狀 */
            symptoms: string | null;
            /** @description 作業經歷與工作描述 */
            workNote: string | null;
        };
        PhraseDto: {
            /** Format: uuid */
            id: string;
            /** @example 不法侵害－措施 */
            category: string;
            text: string;
            /**
             * @description 措施類片語：改善＝應增加或改善，建議＝建議可採行
             * @enum {string|null}
             */
            kind: "改善" | "建議" | null;
        };
        RecordContentDto: {
            /** @description 說明 */
            explain: string;
            /** @description 處理狀況 */
            handling: string;
            /** @description 備註 */
            note: string;
        };
        HelperDto: {
            /** Format: uuid */
            userId: string;
            /** @description 投入分鐘數（附表八統計用） */
            minutes: number;
        };
        RecordDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            employeeId: string;
            /** @example 健康面談諮詢紀錄 */
            category: string;
            /** Format: date-time */
            occurredAt: string;
            consultTypes: ("健康檢查／體格檢查報告異常" | "特殊健檢異常：危害類別與分級" | "人因性危害預防計畫" | "執行職務遭受不法侵害預防計畫" | "異常工作負荷促發疾病預防計畫" | "工作場所母性健康保護計畫" | "未滿 18 歲及中高齡員工")[];
            lifestyleAdvice: ("減重" | "戒菸／酒／檳榔" | "飲食建議" | "充足睡眠、規律作息、紓解壓力" | "建立運動習慣" | "定期量血壓" | "定期量腰圍" | "保持正確姿勢與適當動作方式與力道" | "避免久坐久站" | "避免用眼過度" | "定時喝水、避免憋尿")[];
            content: components["schemas"]["RecordContentDto"] | null;
            helpers: components["schemas"]["HelperDto"][];
            /** @enum {string} */
            result: "追蹤" | "結案";
            /** Format: date */
            followUpOn: string | null;
            /** Format: uuid */
            followUpUserId: string | null;
            followUpDone: boolean;
            /** @description 暫存 */
            draft: boolean;
        };
        FollowUpDto: {
            /** Format: uuid */
            recordId: string;
            /** Format: uuid */
            employeeId: string;
            empNo: string;
            employeeName: string;
            category: string;
            /** Format: date */
            followUpOn: string;
        };
        CaseDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            status: "未開單" | "起單" | "處理中" | "結案";
            /**
             * Format: uuid
             * @description 主責人員
             */
            leadUserId: string | null;
            leadName: string | null;
            /** Format: date */
            openedOn: string;
            /**
             * Format: date
             * @description 通知日
             */
            noticeOn: string | null;
            /**
             * Format: date
             * @description 預計處理日
             */
            plannedOn: string | null;
            /**
             * Format: date
             * @description 回覆日
             */
            repliedOn: string | null;
            /** @description 員工是否同意 */
            agreed: boolean | null;
            /** Format: date */
            closedOn: string | null;
        };
        CaseEventDto: {
            /** Format: uuid */
            id: string;
            /**
             * @description hc 健檢、sp 特殊健檢、wl 異常負荷、er 人因、mat 母性、age 年齡
             * @enum {string}
             */
            type: "hc" | "wl" | "er" | "mat" | "age" | "sp";
            /** Format: date */
            occurredOn: string;
            description: string;
            /** @enum {string} */
            status: "未開單" | "起單" | "處理中" | "結案";
        };
        EmployeeCaseDto: {
            /** Format: uuid */
            employeeId: string;
            empNo: string;
            name: string;
            department: string;
            /**
             * @description 顯示狀態：結案後有新事件會回到未開單
             * @enum {string}
             */
            status: "未開單" | "起單" | "處理中" | "結案";
            /** @description 目前（最新）的個案 */
            case: components["schemas"]["CaseDto"] | null;
            events: components["schemas"]["CaseEventDto"][];
        };
        StatusChangeDto: {
            /** Format: uuid */
            eventId: string;
            /** @enum {string|null} */
            fromStatus: "未開單" | "起單" | "處理中" | "結案" | null;
            /** @enum {string} */
            toStatus: "未開單" | "起單" | "處理中" | "結案";
            note: string | null;
            /** Format: date-time */
            at: string;
        };
        EmployeeCaseDetailDto: {
            /** Format: uuid */
            employeeId: string;
            empNo: string;
            name: string;
            department: string;
            /**
             * @description 顯示狀態：結案後有新事件會回到未開單
             * @enum {string}
             */
            status: "未開單" | "起單" | "處理中" | "結案";
            /** @description 目前（最新）的個案 */
            case: components["schemas"]["CaseDto"] | null;
            events: components["schemas"]["CaseEventDto"][];
            history: components["schemas"]["StatusChangeDto"][];
        };
        DispatchDto: {
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: date */
            sentOn: string;
            /** Format: date */
            dueOn: string | null;
            total: number;
            filled: number;
            suspected: number;
        };
        SurveyDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            employeeId: string;
            empNo: string;
            name: string;
            /** @enum {string} */
            status: "未填寫" | "已填寫";
            /** @description 各部位最高分（0–5） */
            maxScore: number | null;
            /** @description 疑似有危害（任一部位 ≥ 3） */
            suspectedHazard: boolean | null;
            /** Format: date-time */
            filledAt: string | null;
            /** @enum {string|null} */
            filledBy: "self" | "nurse" | null;
        };
        InterviewDto: {
            /** @enum {string} */
            status: "待安排" | "已安排" | "已面談" | "拒絕面談";
            /** Format: date */
            interviewedOn: string | null;
            /** Format: uuid */
            doctorUserId: string | null;
            /** @description 工作安排建議（人資、主管可見） */
            workAdvice: {
                [key: string]: unknown;
            } | null;
            /** @description 面談紀錄（醫療資料，加密儲存） */
            notes: string | null;
            /** Format: date */
            nextOn: string | null;
        };
        AssessmentDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            employeeId: string;
            empNo: string;
            name: string;
            /** Format: date */
            sentOn: string;
            /** @description 個人相關過勞分數 */
            personalBurnout: number | null;
            /** @description 工作相關過勞分數 */
            workBurnout: number | null;
            overtime1m: number | null;
            overtime6mAvg: number | null;
            workPatterns: string[];
            /** @description 十年心血管風險、負荷等級與矩陣結果（評估當下的快照） */
            evaluation: {
                [key: string]: unknown;
            } | null;
            /** @description 0 低度、1 中度、2 高度風險；資料不全時為 null */
            riskLevel: number | null;
            interview: components["schemas"]["InterviewDto"] | null;
        };
        EnvAssessmentDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            siteId: string;
            area: string;
            /** Format: date */
            assessedOn: string;
            hazards: {
                [key: string]: unknown;
            };
            /**
             * @description 依危害評估建議的管理分級
             * @enum {string}
             */
            level: "第一級管理" | "第二級管理" | "第三級管理";
        };
        MaternalCaseDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            employeeId: string;
            name: string;
            /** @enum {string} */
            type: "妊娠" | "產後";
            /** Format: date */
            notifiedOn: string;
            /** Format: date */
            dueDate: string | null;
            /** @description 今日妊娠週數 */
            weeks: number | null;
            /** @enum {string|null} */
            level: "第一級管理" | "第二級管理" | "第三級管理" | null;
            /** @description 自述症狀、風險因子（醫療資料，加密儲存） */
            detail: string | null;
        };
        RiskAssessmentDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            siteId: string;
            /** Format: date */
            assessedOn: string;
            /** @description 每題的可能性、嚴重度、風險等級與控制措施 */
            items: {
                [key: string]: unknown;
            }[];
        };
        WorkAdviceDto: {
            /** Format: uuid */
            employeeId: string;
            empNo: string;
            name: string;
            /** @enum {string} */
            programme: "異常工作負荷" | "母性健康保護";
            /** Format: date */
            on: string | null;
            /** @description 工作安排建議（不含醫療內容） */
            advice: string;
            /** @description 工作限制 */
            restrictions: string[];
        };
        NoticeDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            employeeId: string;
            empNo: string;
            name: string;
            advice: string;
            /** Format: date-time */
            sentAt: string;
            /** Format: date-time */
            readAt: string | null;
        };
        LinkDto: {
            /** @description 寄給員工的一次性連結（只回傳這一次，不儲存） */
            url: string;
            /** Format: date-time */
            expiresAt: string;
        };
        ProfileDto: {
            /** Format: uuid */
            id: string;
            empNo: string;
            name: string;
            lang: string;
            site: string;
            department: string;
        };
        TaskDto: {
            /**
             * @description NMQ 問卷、過勞量表、工時調查、紀錄確認
             * @enum {string}
             */
            kind: "nmq" | "cbi" | "overload" | "acknowledgement";
            /**
             * Format: uuid
             * @description 問卷、評估或確認的 id
             */
            id: string;
            title: string;
            /** Format: date */
            dueOn: string | null;
        };
        AcknowledgementDto: {
            /** Format: uuid */
            id: string;
            /** @example 母性健康保護面談紀錄 */
            title: string;
            /** @description 要確認的內容（不含醫護內部紀錄） */
            content: {
                [key: string]: unknown;
            };
            /** Format: date-time */
            confirmedAt: string | null;
            comment: string | null;
        };
        MyHealthDto: {
            /** @description 我的健檢結果與分級 */
            exams: {
                [key: string]: unknown;
            }[];
            /** @description 我的 NMQ 結果 */
            surveys: {
                [key: string]: unknown;
            }[];
            /** @description 我的過勞評估結果 */
            workload: {
                [key: string]: unknown;
            }[];
        };
        ConsentDto: {
            /** Format: uuid */
            id: string;
            /**
             * @description 告知聲明（已閱讀）或同意（非法定用途）
             * @enum {string}
             */
            kind: "notice" | "consent";
            purpose: string;
            documentVersion: string;
            /** Format: date-time */
            givenAt: string;
            /** Format: date-time */
            withdrawnAt: string | null;
        };
        SignatureDto: {
            /** Format: uuid */
            id: string;
            /** @example 人力資源管理人員 */
            role: string;
            name: string;
            email: string;
            /** Format: date-time */
            sentAt: string | null;
            /** Format: date-time */
            signedAt: string | null;
            comment: string | null;
        };
        ServiceRecordDto: {
            /** Format: uuid */
            id: string;
            /** Format: date */
            serviceOn: string;
            /** Format: uuid */
            siteId: string;
            siteName: string;
            /** @enum {string} */
            status: "草稿" | "簽核中" | "已完成";
            content: {
                [key: string]: unknown;
            };
            signatures: components["schemas"]["SignatureDto"][];
        };
        SignLinkDto: {
            /** Format: uuid */
            signatureId: string;
            role: string;
            name: string;
            /** @description 一次性簽核連結（只回傳這一次，不儲存） */
            url: string;
        };
        ReportTypeDto: {
            /** @enum {string} */
            kind: "health" | "wl" | "ergo";
            type: string;
            title: string;
        };
        ReportDto: {
            kind: string;
            type: string;
            title: string;
            summary: {
                label?: string;
                value?: (string | number) | null;
            }[];
            columns: string[];
            /** @description null：人數少於最小格數而不顯示 */
            rows: ((string | number) | null)[][];
            /** @description 是否有格子因少於 5 人而不顯示（去識別） */
            suppressed: boolean;
        };
        ExportDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            status: "queued" | "running" | "done" | "failed";
            /** @enum {string} */
            format: "xlsx" | "pdf";
            fileName: string | null;
            /** Format: date-time */
            requestedAt: string;
            /** Format: date-time */
            expiresAt: string | null;
        };
        FindingDto: {
            /** @example health_exams */
            table: string;
            /** Format: uuid */
            rowId: string;
            /** Format: uuid */
            employeeId: string | null;
            empNo: string | null;
            /** Format: date */
            retainUntil: string;
            /** Format: date-time */
            foundAt: string;
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
    TenantController_tenant: {
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
                    "application/json": components["schemas"]["TenantDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    TenantController_health: {
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
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
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
                    "application/json": components["schemas"]["StaffMeDto"] | components["schemas"]["EmployeeMeDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    AuthController_signIn: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    token: string;
                    /** @enum {string} */
                    as: "staff" | "employee";
                };
            };
        };
        responses: {
            /** @description 已登入，回應帶 Set-Cookie */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 格式錯誤（validation_failed） */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description token 無效，或沒有對應的帳號 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 登入服務尚未設定（sign_in_unavailable） */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    AuthController_signOut: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
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
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    OrgController_tree: {
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
                    "application/json": components["schemas"]["LegalEntityDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    OrgController_createLegalEntity: {
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
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_deleteLegalEntity: {
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
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_updateLegalEntity: {
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
                    code?: string;
                    name?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_createSite: {
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
                    legalEntityId: string;
                    code: string;
                    name: string;
                    address?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_deleteSite: {
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
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_updateSite: {
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
                    /** Format: uuid */
                    legalEntityId?: string;
                    code?: string;
                    name?: string;
                    address?: string | null;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_createDepartment: {
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
                    siteId: string;
                    code?: string | null;
                    name: string;
                    managerName?: string | null;
                    managerEmail?: string | null;
                    managerPhone?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_deleteDepartment: {
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
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_updateDepartment: {
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
                    /** Format: uuid */
                    siteId?: string;
                    code?: string | null;
                    name?: string;
                    managerName?: string | null;
                    managerEmail?: string | null;
                    managerPhone?: string | null;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
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
    OrgController_import: {
        parameters: {
            query?: {
                commit?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrgImportReportDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 檔案有錯誤（import_invalid），未寫入；report 內有錯誤列 */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    UsersController_list: {
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
                    "application/json": components["schemas"]["StaffAccountDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    UsersController_invite: {
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
                    role: "職護" | "職醫" | "職安衛人員" | "人資" | "部門主管" | "租戶管理員";
                    /** @default [] */
                    siteIds?: string[];
                    /** @default null */
                    phone?: string | null;
                    /** @default null */
                    qualification?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffAccountDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 此 Email 已有帳號（account_exists） */
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
    UsersController_update: {
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
                    role?: "職護" | "職醫" | "職安衛人員" | "人資" | "部門主管" | "租戶管理員";
                    siteIds?: string[];
                    phone?: string | null;
                    qualification?: string | null;
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
                    "application/json": components["schemas"]["StaffAccountDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    EmployeesController_import: {
        parameters: {
            query?: {
                commit?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeImportReportDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 檔案有錯誤（import_invalid），未寫入；report 內有錯誤列 */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    ExamSettingsController_listMappings: {
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
                    "application/json": components["schemas"]["ExamMappingDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamSettingsController_createMapping: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    clinic: string;
                    columns: {
                        empNo?: string;
                        nationalId?: string;
                        examDate: string;
                        kind?: string;
                        smoker?: string;
                        history?: string;
                        symptoms?: string;
                        workNote?: string;
                        specialHazard?: string;
                        specialLevel?: string;
                    };
                    items: {
                        [key: string]: string;
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
                    "application/json": components["schemas"]["ExamMappingDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamSettingsController_updateMapping: {
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
                    clinic: string;
                    columns: {
                        empNo?: string;
                        nationalId?: string;
                        examDate: string;
                        kind?: string;
                        smoker?: string;
                        history?: string;
                        symptoms?: string;
                        workNote?: string;
                        specialHazard?: string;
                        specialLevel?: string;
                    };
                    items: {
                        [key: string]: string;
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
                    "application/json": components["schemas"]["ExamMappingDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamSettingsController_deleteMapping: {
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
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamSettingsController_listRuleSets: {
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
                    "application/json": components["schemas"]["RuleSetDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamSettingsController_createRuleSet: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    note?: string;
                    rules: {
                        /** @enum {string} */
                        code: "B0111" | "B0112" | "B0104" | "B0107" | "B0201" | "B0202" | "B0203" | "B0204" | "B0205" | "B0301" | "B0302" | "B0401" | "B0501";
                        name: string;
                        /** @enum {string} */
                        sex: "男" | "女" | "不限";
                        /** @default  */
                        unit?: string;
                        /**
                         * @default number
                         * @enum {string}
                         */
                        type?: "number" | "text";
                        /**
                         * @default manual
                         * @enum {string}
                         */
                        src?: "manual" | "demo" | "physician";
                        levels: ({
                            lv: number;
                            min?: number;
                            max?: number;
                        } | {
                            lv: number;
                            values: string[];
                        })[];
                    }[];
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuleSetDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamSettingsController_ruleSet: {
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
                    "application/json": components["schemas"]["RuleSetDetailDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamSettingsController_publish: {
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
                    "application/json": components["schemas"]["RuleSetDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamsController_mappings: {
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
                    "application/json": components["schemas"]["ExamMappingDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamsController_import: {
        parameters: {
            query: {
                fileName?: unknown;
                commit?: "true" | "false";
                /** @description 健檢匯入對照 id */
                mapping: unknown;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExamImportReportDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 檔案有錯誤（import_invalid），未寫入 */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    ExamsController_history: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employeeId: string;
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
                    "application/json": components["schemas"]["ExamSummaryDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ExamsController_detail: {
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
                    "application/json": components["schemas"]["ExamDetailDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RecordsController_listPhrases: {
        parameters: {
            query?: {
                category?: string;
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
                    "application/json": components["schemas"]["PhraseDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RecordsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employeeId: string;
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
                    "application/json": components["schemas"]["RecordDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RecordsController_followUps: {
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
                    "application/json": components["schemas"]["FollowUpDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RecordsController_create: {
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
                    employeeId: string;
                    category: string;
                    /** Format: date-time */
                    occurredAt: string;
                    /** @default [] */
                    consultTypes?: ("健康檢查／體格檢查報告異常" | "特殊健檢異常：危害類別與分級" | "人因性危害預防計畫" | "執行職務遭受不法侵害預防計畫" | "異常工作負荷促發疾病預防計畫" | "工作場所母性健康保護計畫" | "未滿 18 歲及中高齡員工")[];
                    /** @default [] */
                    lifestyleAdvice?: ("減重" | "戒菸／酒／檳榔" | "飲食建議" | "充足睡眠、規律作息、紓解壓力" | "建立運動習慣" | "定期量血壓" | "定期量腰圍" | "保持正確姿勢與適當動作方式與力道" | "避免久坐久站" | "避免用眼過度" | "定時喝水、避免憋尿")[];
                    content: {
                        /** @default  */
                        explain?: string;
                        /** @default  */
                        handling?: string;
                        /** @default  */
                        note?: string;
                    };
                    /** @default [] */
                    helpers?: {
                        /** Format: uuid */
                        userId: string;
                        minutes: number;
                    }[];
                    /** @enum {string} */
                    result: "追蹤" | "結案";
                    /** @default null */
                    followUpOn?: string | null;
                    /** @default null */
                    followUpUserId?: string | null;
                    /** @default false */
                    followUpDone?: boolean;
                    /** @default false */
                    draft?: boolean;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecordDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RecordsController_update: {
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
                    category?: string;
                    /** Format: date-time */
                    occurredAt?: string;
                    consultTypes?: ("健康檢查／體格檢查報告異常" | "特殊健檢異常：危害類別與分級" | "人因性危害預防計畫" | "執行職務遭受不法侵害預防計畫" | "異常工作負荷促發疾病預防計畫" | "工作場所母性健康保護計畫" | "未滿 18 歲及中高齡員工")[];
                    lifestyleAdvice?: ("減重" | "戒菸／酒／檳榔" | "飲食建議" | "充足睡眠、規律作息、紓解壓力" | "建立運動習慣" | "定期量血壓" | "定期量腰圍" | "保持正確姿勢與適當動作方式與力道" | "避免久坐久站" | "避免用眼過度" | "定時喝水、避免憋尿")[];
                    content?: {
                        /** @default  */
                        explain?: string;
                        /** @default  */
                        handling?: string;
                        /** @default  */
                        note?: string;
                    };
                    helpers?: {
                        /** Format: uuid */
                        userId: string;
                        minutes: number;
                    }[];
                    /** @enum {string} */
                    result?: "追蹤" | "結案";
                    followUpOn?: string | null;
                    followUpUserId?: string | null;
                    followUpDone?: boolean;
                    draft?: boolean;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecordDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RecordsController_createPhrase: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    category: string;
                    text: string;
                    /** @default null */
                    kind?: ("改善" | "建議") | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PhraseDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RecordsController_deletePhrase: {
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
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    CasesController_list: {
        parameters: {
            query?: {
                status?: "未開單" | "起單" | "處理中" | "結案";
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
                    "application/json": components["schemas"]["EmployeeCaseDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    CasesController_ageEvents: {
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
                    "application/json": {
                        raised?: number;
                    };
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    CasesController_detail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employeeId: string;
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
                    "application/json": components["schemas"]["EmployeeCaseDetailDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    CasesController_open: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                employeeId: string;
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
                    "application/json": components["schemas"]["EmployeeCaseDetailDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    CasesController_update: {
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
                    /** @enum {string} */
                    status?: "處理中" | "結案";
                    /** Format: uuid */
                    leadUserId?: string;
                    noticeOn?: string | null;
                    plannedOn?: string | null;
                    repliedOn?: string | null;
                    agreed?: boolean | null;
                    note?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeCaseDetailDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ErgoController_dispatches: {
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
                    "application/json": components["schemas"]["DispatchDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ErgoController_dispatch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** Format: date */
                    sentOn?: string;
                    /** @default null */
                    dueOn?: string | null;
                    employeeIds: string[];
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DispatchDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ErgoController_surveys: {
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
                    "application/json": components["schemas"]["SurveyDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ErgoController_fill: {
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
                    scores: {
                        neck: number;
                        shoulderL: number;
                        shoulderR: number;
                        upperBack: number;
                        lowerBack: number;
                        elbowL: number;
                        elbowR: number;
                        wristL: number;
                        wristR: number;
                        hipL: number;
                        hipR: number;
                        kneeL: number;
                        kneeR: number;
                        ankleL: number;
                        ankleR: number;
                    };
                    /** @default {} */
                    yesNo?: {
                        [key: string]: boolean;
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
                    "application/json": components["schemas"]["SurveyDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    WorkloadController_all: {
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
                    "application/json": components["schemas"]["AssessmentDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    WorkloadController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    employeeIds: string[];
                    /** Format: date */
                    sentOn?: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssessmentDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    WorkloadController_fatigue: {
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
                    cbi: {
                        p: number[];
                        w: number[];
                    };
                } | {
                    personalBurnout: number;
                    workBurnout: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssessmentDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    WorkloadController_overload: {
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
                    overtime1m: number;
                    overtime6mAvg: number;
                    workPatterns: ("不規律的工作" | "經常出差的工作" | "輪班或夜班工作" | "作業環境（異常溫度、噪音、時差）" | "伴隨精神緊張的工作")[];
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssessmentDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    WorkloadController_interview: {
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
                    /** @enum {string} */
                    status: "待安排" | "已安排" | "已面談" | "拒絕面談";
                    /** @default null */
                    interviewedOn?: string | null;
                    /** @default null */
                    doctorUserId?: string | null;
                    /** @default null */
                    workAdvice?: {
                        fitness: string;
                        /** @default [] */
                        restrictions?: string[];
                        /** @default  */
                        suggestion?: string;
                    } | null;
                    /** @default null */
                    notes?: string | null;
                    /** @default null */
                    nextOn?: string | null;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssessmentDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_envs: {
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
                    "application/json": components["schemas"]["EnvAssessmentDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_createEnv: {
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
                    siteId: string;
                    /** @default null */
                    departmentId?: string | null;
                    area: string;
                    /** @default null */
                    shiftType?: string | null;
                    /** Format: date */
                    assessedOn: string;
                    hazards: {
                        [key: string]: {
                            /** @enum {string} */
                            v: "有" | "可能有影響" | "無";
                            note?: string;
                        };
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
                    "application/json": components["schemas"]["EnvAssessmentDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_maternal: {
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
                    "application/json": components["schemas"]["MaternalCaseDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_createMaternal: {
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
                    employeeId: string;
                    /** @enum {string} */
                    type: "妊娠" | "產後";
                    /** Format: date */
                    notifiedOn: string;
                    /** @default null */
                    dueDate?: string | null;
                    /** @default null */
                    birthDate?: string | null;
                    /** @default null */
                    envAssessmentId?: string | null;
                    /** @default null */
                    detail?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MaternalCaseDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_interview: {
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
                    /** Format: date */
                    interviewedOn: string;
                    fitAdvice: string;
                    /** @default [] */
                    limits?: string[];
                    /** @default  */
                    agreedArrangement?: string;
                    /** @default null */
                    notes?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_risks: {
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
                    "application/json": components["schemas"]["RiskAssessmentDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_createRisk: {
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
                    siteId: string;
                    /** @default null */
                    departmentId?: string | null;
                    /** Format: date */
                    assessedOn: string;
                    items: {
                        question: string;
                        /** @enum {string} */
                        likelihood: "可能" | "不太可能" | "極不可能";
                        /** @enum {string} */
                        severity: "嚴重" | "中" | "輕";
                        /** @default  */
                        controls?: string;
                    }[];
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RiskAssessmentDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_checklists: {
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
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_createChecklist: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    kind: "作業場所" | "人力";
                    /** Format: uuid */
                    siteId: string;
                    /** Format: date */
                    checkedOn: string;
                    items: {
                        item: string;
                        ok: boolean;
                        /** @default  */
                        note?: string;
                    }[];
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_incidents: {
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
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    MaternalViolenceController_createIncident: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: date */
                    occurredOn: string;
                    /** Format: uuid */
                    siteId: string;
                    type: string;
                    /** @default null */
                    victimEmployeeId?: string | null;
                    /** @default null */
                    detail?: string | null;
                    /** @default [] */
                    followUps?: string[];
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    AdviceController_workAdvice: {
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
                    "application/json": components["schemas"]["WorkAdviceDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    AdviceController_myNotices: {
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
                    "application/json": components["schemas"]["NoticeDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    AdviceController_notify: {
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
                    employeeId: string;
                    /** Format: uuid */
                    managerUserId: string;
                    /** @enum {string} */
                    subjectTable: "interviews" | "maternal_interviews";
                    /** Format: uuid */
                    subjectId: string;
                    advice: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    AdviceController_link: {
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
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LinkDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_profile: {
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
                    "application/json": components["schemas"]["ProfileDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_tasks: {
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
                    "application/json": components["schemas"]["TaskDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_nmq: {
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
                    scores: {
                        neck: number;
                        shoulderL: number;
                        shoulderR: number;
                        upperBack: number;
                        lowerBack: number;
                        elbowL: number;
                        elbowR: number;
                        wristL: number;
                        wristR: number;
                        hipL: number;
                        hipR: number;
                        kneeL: number;
                        kneeR: number;
                        ankleL: number;
                        ankleR: number;
                    };
                    /** @default {} */
                    yesNo?: {
                        [key: string]: boolean;
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
                    "application/json": {
                        suspectedHazard?: boolean;
                    };
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_cbi: {
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
                    p: number[];
                    w: number[];
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        submitted?: boolean;
                    };
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_overload: {
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
                    overtime1m: number;
                    overtime6mAvg: number;
                    workPatterns: ("不規律的工作" | "經常出差的工作" | "輪班或夜班工作" | "作業環境（異常溫度、噪音、時差）" | "伴隨精神緊張的工作")[];
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        submitted?: boolean;
                    };
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_acknowledgement: {
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
                    "application/json": components["schemas"]["AcknowledgementDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_confirm: {
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
                    comment?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcknowledgementDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_health: {
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
                    "application/json": components["schemas"]["MyHealthDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_export: {
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
                    "application/json": components["schemas"]["MyHealthDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_consents: {
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
                    "application/json": components["schemas"]["ConsentDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_give: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    kind: "notice" | "consent";
                    purpose: string;
                    documentVersion: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsentDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    PortalController_withdraw: {
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
                    "application/json": components["schemas"]["ConsentDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    SignController_open: {
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
                    "application/json": components["schemas"]["AcknowledgementDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 連結已使用（token_used）或已過期（token_expired） */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    SignController_confirm: {
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
                    comment?: string;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcknowledgementDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    ServiceRecordsController_list: {
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
                    "application/json": components["schemas"]["ServiceRecordDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ServiceRecordsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: date */
                    serviceOn: string;
                    /** Format: uuid */
                    siteId: string;
                    content: {
                        from: string;
                        to: string;
                        /** Format: uuid */
                        executorUserId: string;
                        /** @default  */
                        unit?: string;
                        /** @default  */
                        departmentName?: string;
                        headcount: {
                            adminM: number;
                            adminF: number;
                            opM: number;
                            opF: number;
                            general: number;
                        };
                        /** @default [] */
                        special?: {
                            category: string;
                            count: number;
                        }[];
                        /** @default  */
                        workplace?: string;
                        /** @default  */
                        services?: string;
                        /** @default  */
                        findings?: string;
                        /** @default  */
                        followUp?: string;
                    };
                    signers: {
                        role: string;
                        name: string;
                        /** Format: email */
                        email: string;
                    }[];
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceRecordDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ServiceRecordsController_update: {
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
                    /** Format: date */
                    serviceOn: string;
                    /** Format: uuid */
                    siteId: string;
                    content: {
                        from: string;
                        to: string;
                        /** Format: uuid */
                        executorUserId: string;
                        /** @default  */
                        unit?: string;
                        /** @default  */
                        departmentName?: string;
                        headcount: {
                            adminM: number;
                            adminF: number;
                            opM: number;
                            opF: number;
                            general: number;
                        };
                        /** @default [] */
                        special?: {
                            category: string;
                            count: number;
                        }[];
                        /** @default  */
                        workplace?: string;
                        /** @default  */
                        services?: string;
                        /** @default  */
                        findings?: string;
                        /** @default  */
                        followUp?: string;
                    };
                    signers: {
                        role: string;
                        name: string;
                        /** Format: email */
                        email: string;
                    }[];
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceRecordDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ServiceRecordsController_submit: {
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
                    "application/json": components["schemas"]["SignLinkDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ServiceRecordsController_resend: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                signatureId: string;
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
                    "application/json": components["schemas"]["SignLinkDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ReportsController_types: {
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
                    "application/json": components["schemas"]["ReportTypeDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ReportsController_report: {
        parameters: {
            query?: {
                departmentId?: unknown;
                siteId?: unknown;
                legalEntityId?: unknown;
            };
            header?: never;
            path: {
                kind: string;
                type: string;
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
                    "application/json": components["schemas"]["ReportDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ReportsController_myExports: {
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
                    "application/json": components["schemas"]["ExportDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ReportsController_requestExport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    report: string;
                    type: string;
                    /** @default {} */
                    filters?: {
                        /** Format: uuid */
                        legalEntityId?: string;
                        /** Format: uuid */
                        siteId?: string;
                        /** Format: uuid */
                        departmentId?: string;
                    };
                    /** @enum {string} */
                    format: "xlsx" | "pdf";
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportDto"];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ReportsController_link: {
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
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        url?: string;
                        /** Format: date-time */
                        expiresAt?: string;
                    };
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    ReportsController_download: {
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
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
                    "application/pdf": string;
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": components["schemas"]["ApiErrorDto"];
                    "application/pdf": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": components["schemas"]["ApiErrorDto"];
                    "application/pdf": components["schemas"]["ApiErrorDto"];
                };
            };
        };
    };
    RetentionController_list: {
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
                    "application/json": components["schemas"]["FindingDto"][];
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
    RetentionController_scan: {
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
                    "application/json": {
                        found?: number;
                    };
                };
            };
            /** @description 未登入或登入已逾時 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 租戶已停用（tenant_inactive）、跨來源請求（cross_origin）或沒有權限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorDto"];
                };
            };
            /** @description 網址不是任何租戶的子網域（unknown_tenant） */
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
