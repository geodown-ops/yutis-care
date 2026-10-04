import { Module } from '@nestjs/common';
import { ServiceRecordsController } from '../service/service-records.controller.js';
import { SignOffRolesController } from '../service/sign-off.js';
import { JobQueue, ReportsController } from './reports.controller.js';
import { RetentionController } from './retention.controller.js';

/** 附表八 and sign-off, statistical reports and exports, retention review. */
@Module({ controllers: [ServiceRecordsController, SignOffRolesController, ReportsController, RetentionController], providers: [JobQueue] })
export class ReportsModule {}
