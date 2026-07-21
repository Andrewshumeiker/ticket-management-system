import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';

@ApiTags('Tickets')
@ApiSecurity('x-api-key')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ── POST /api/v1/tickets ──────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nuevo ticket',
    description:
      'Llamado por Power Automate. Soporta idempotencyKey para evitar duplicados en retries.',
  })
  @ApiResponse({ status: 201, description: 'Ticket creado exitosamente' })
  @ApiResponse({
    status: 400,
    description: 'Validación fallida o usuario/categoría no encontrada',
  })
  @ApiResponse({
    status: 500,
    description: 'Error de transacción (rollback ejecutado)',
  })
  create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  // ── GET /api/v1/tickets ───────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Listar tickets con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista paginada de tickets' })
  findAll(@Query() filters: FilterTicketsDto) {
    return this.ticketsService.findAll(filters);
  }

  // ── GET /api/v1/tickets/metrics ───────────────────────────────────────────
  @Get('metrics')
  @ApiOperation({
    summary: 'KPIs y métricas operativas',
    description:
      'Retorna 5 KPIs: volumen por estado, MTTR, distribución por prioridad, SLA compliance y tickets críticos vencidos.',
  })
  getMetrics() {
    return this.ticketsService.getMetrics();
  }

  // ── GET /api/v1/tickets/history/recent ────────────────────────────────────
  @Get('history/recent')
  @ApiOperation({
    summary: 'Historial reciente para polling de n8n',
    description:
      'Retorna cambios de estado de los últimos N minutos. Usado por n8n para disparar notificaciones.',
  })
  @ApiQuery({ name: 'minutes', required: false, example: 2 })
  getRecentHistory(@Query('minutes') minutes?: string) {
    return this.ticketsService.getRecentHistory(
      minutes ? parseInt(minutes) : 2,
    );
  }

  // ── GET /api/v1/tickets/:id ───────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Obtener ticket por ID con historial completo' })
  @ApiParam({ name: 'id', description: 'UUID del ticket' })
  @ApiResponse({ status: 200, description: 'Ticket encontrado' })
  @ApiResponse({ status: 404, description: 'Ticket no encontrado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketsService.findOne(id);
  }

  // ── PATCH /api/v1/tickets/:id/status ─────────────────────────────────────
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Cambiar estado del ticket',
    description:
      'Actualiza el estado y registra la transición en ticket_history. Al llegar a RESOLVED, registra el timestamp y calcula si cumplió el SLA.',
  })
  @ApiParam({ name: 'id', description: 'UUID del ticket' })
  @ApiResponse({
    status: 200,
    description: 'Estado actualizado con métricas de resolución',
  })
  @ApiResponse({
    status: 400,
    description: 'Estado inválido o técnico no encontrado',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ticketsService.updateStatus(id, dto);
  }
}
