import { Module } from '@nestjs/common';
import { EmployeeDirectoryController } from './employees.controller.js';

/** Employee directory: identity data for 職護、職醫 and 人資, limited to their sites. */
@Module({ controllers: [EmployeeDirectoryController] })
export class EmployeesModule {}
