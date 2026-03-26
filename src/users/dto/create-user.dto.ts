import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Carlos Mendoza' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'carlos.mendoza@empresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+573001234567', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: 'Infraestructura TI', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
}
