import { Module } from '@nestjs/common';
import { ServiceRecordsController } from '../service/service-records.controller.js';
import { JobQueue, ReportsController } from './reports.controller.js';
import { RetentionController } from './retention.controller.js';

/** 附表八 and sign-off, statistical reports and exports, retention review. */
@Module({ controllers: [ServiceRecordsController, ReportsController, RetentionController], providers: [JobQueue] })
export class ReportsModule {}
