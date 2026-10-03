import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller.js';
import { OrgController } from './org.controller.js';
import { LoggingStaffInvitations, STAFF_INVITATIONS, UsersController } from './users.controller.js';

/** Tenant administration (租戶管理, /api/admin/*): organisation, staff accounts, employee import. Tenant admins only. */
@Module({
  controllers: [OrgController, UsersController, EmployeesController],
  providers: [{ provide: STAFF_INVITATIONS, useClass: LoggingStaffInvitations }],
})
export class AdminModule {}
