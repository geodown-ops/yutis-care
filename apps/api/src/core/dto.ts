/* Response shapes shared by several controllers. Swagger keys schemas by class name, so each name is declared once. */
import { ApiProperty } from '@nestjs/swagger';

export class CreatedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

/** Outcome of a fill-in reminder (催填): how many were emailed, and who has no email address. */
export class RemindResultDto {
  @ApiProperty({ description: '寄出催填通知的人數' }) emailed!: number;
  @ApiProperty({ type: [String], format: 'uuid', description: '沒有 Email、無法通知的員工' }) noEmail!: string[];
}
