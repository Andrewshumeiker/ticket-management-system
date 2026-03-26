import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { TicketStatus } from '../../common/enums/ticket.enum';

export class UpdateStatusDto {
  @ApiProperty({
    enum: TicketStatus,
    example: TicketStatus.RESOLVED,
    description: 'Nuevo estado del ticket',
  })
  @IsEnum(TicketStatus)
  status: TicketStatus;

  @ApiProperty({
    example: 'b7c2f3d4-1111-2222-3333-444455556666',
    description: 'UUID del técnico que realiza el cambio de estado',
  })
  @IsUUID()
  changedBy: string;

  @ApiProperty({
    example: 'Se reinició el servicio y se verificó conectividad.',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}
