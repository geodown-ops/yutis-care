/* The fixed choices of the programme forms, so the screens do not each keep their own copy. */
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ADJUST_HOURS, CHANGE_WORK, ERGO_MEASURES, SHIFT_TYPES, SPECIAL_OPERATIONS, WORK_PATTERNS, WORKLOAD_FITNESS } from '@yutis/domain';
import { StaffOnly } from '../auth/access.js';

class ProgrammeOptionsDto {
  @ApiProperty({ type: [String], description: '工作型態（過勞評估，可複選）' }) workPatterns!: readonly string[];
  @ApiProperty({ type: [String], description: '工作區分（過勞面談）' }) workloadFitness!: readonly string[];
  @ApiProperty({ type: [String], description: '調整或縮短工作時間（過勞面談）' }) adjustHours!: readonly string[];
  @ApiProperty({ type: [String], description: '變更工作（過勞面談）' }) changeWork!: readonly string[];
  @ApiProperty({ type: [String], description: '改善措施（人因列管）' }) ergoMeasures!: readonly string[];
  @ApiProperty({ type: [String], description: '特別危害健康作業類別' }) specialOperations!: readonly string[];
  @ApiProperty({ type: [String], description: '作業型態（母性作業環境評估）' }) shiftTypes!: readonly string[];
}

@ApiTags('programs')
@Controller('programs')
export class OptionsController {
  @Get('options')
  @StaffOnly({ feature: 'programs' })
  @ApiOperation({ summary: '四大計畫表單的選項', description: '與雛形相同的固定選項；各租戶目前相同。' })
  @ApiOkResponse({ type: ProgrammeOptionsDto })
  options(): ProgrammeOptionsDto {
    return {
      workPatterns: WORK_PATTERNS, workloadFitness: WORKLOAD_FITNESS, adjustHours: ADJUST_HOURS, changeWork: CHANGE_WORK,
      ergoMeasures: ERGO_MEASURES, specialOperations: SPECIAL_OPERATIONS, shiftTypes: SHIFT_TYPES,
    };
  }
}
