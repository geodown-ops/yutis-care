import { Module } from '@nestjs/common';
import { PortalController } from '../portal/portal.controller.js';
import { AdviceController } from './advice.controller.js';
import { ErgoController } from './ergo.controller.js';
import { MaternalViolenceController } from './maternal-violence.controller.js';
import { OptionsController } from './options.controller.js';
import { SignController } from './sign.controller.js';
import { WorkloadController } from './workload.controller.js';

/** The four programmes (四大計畫), what reaches HR and managers, the employee portal and one-time sign links. */
@Module({ controllers: [ErgoController, WorkloadController, MaternalViolenceController, AdviceController, OptionsController, PortalController, SignController] })
export class ProgramsModule {}
