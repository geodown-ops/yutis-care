import { Module } from '@nestjs/common';
import { ExamsController } from '../exams/exams.controller.js';
import { CasesController } from './cases.controller.js';
import { RecordsController } from './records.controller.js';

/** Health checks, assistance records and case management: occupational health staff (職護、職醫) only. */
@Module({ controllers: [ExamsController, RecordsController, CasesController] })
export class CareModule {}
