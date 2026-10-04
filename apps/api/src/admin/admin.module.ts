import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { EmployeesController } from './employees.controller.js';
import { ExamSettingsController } from './exam-settings.controller.js';
import { OrgController } from './org.controller.js';
import { UsersController } from './users.controller.js';

/** Tenant administration (租戶管理, /api/admin/*): organisation, staff accounts, employee import, exam settings, audit search. Tenant admins only. */
@Module({
  controllers: [OrgController, UsersController, EmployeesController, ExamSettingsController, AuditController],
})
export class AdminModule {}
