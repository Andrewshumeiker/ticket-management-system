import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({
    example: 'El servidor de producción no responde',
    description: 'Título corto y descriptivo del incidente',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example: 'Desde las 9am el servidor muestra timeout en todos los endpoints.',
    description: 'Descripción detallada del problema',
  })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiProperty({
    example: 'infrastructure',
    description: 'Slug de la categoría (ver GET /categories)',
  })
  @IsString()
  categorySlug: string;

  @ApiProperty({
    example: 'https://res.cloudinary.com/myapp/image/upload/evidence.jpg',
    required: false,
    description: 'URL pública de la imagen subida a Cloudinary por Power Automate',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  @ApiProperty({
    example: 'a3b8d1b6-0b3b-4b1a-9c1a-1a2b3c4d5e6f',
    description: 'UUID del usuario que reporta el ticket',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    example: 'uuid-generado-por-power-apps',
    required: false,
    description: 'Clave de idempotencia generada por Power Apps para evitar duplicados en retries',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
