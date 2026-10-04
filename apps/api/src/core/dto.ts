/* Response shapes shared by several controllers. Swagger keys schemas by class name, so each name is declared once. */
import { ApiProperty } from '@nestjs/swagger';

export class CreatedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
