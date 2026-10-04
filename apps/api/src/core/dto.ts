/* Response shapes shared by several controllers. Swagger keys schemas by class name, so each name is declared once. */
import { ApiProperty } from '@nestjs/swagger';

export class CreatedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

/** Outcome of a fill-in reminder (催填): how many were emailed, whether mail really goes out, and who has no email address. */
export class RemindResultDto {
  @ApiProperty({ description: '有 Email、已排入催填通知的人數' }) emailed!: number;
  @ApiProperty({ description: '信真的會寄出；系統設定為只記錄不寄（EMAIL_PROVIDER=log，測試環境）時為 false' }) delivered!: boolean;
  @ApiProperty({ type: [String], format: 'uuid', description: '沒有 Email、無法通知的員工' }) noEmail!: string[];
}
