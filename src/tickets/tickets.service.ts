import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Repository } from 'typeorm';

import { Ticket }        from './entities/ticket.entity';
import { TicketHistory } from './entities/ticket-history.entity';
import { User }          from '../users/entities/user.entity';
import { Category }      from '../categories/entities/category.entity';

import { CreateTicketDto }  from './dto/create-ticket.dto';
import { UpdateStatusDto }  from './dto/update-status.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';

import { TicketStatus, TicketPriority } from '../common/enums/ticket.enum';

// ─── Palabras clave que elevan la prioridad a CRITICAL ───────────────────────
const CRITICAL_KEYWORDS = [
  'caído', 'caido', 'caída', 'producción', 'produccion',
  'pérdida de datos', 'urgente', 'crítico', 'critico',
  'no funciona', 'bloqueado', 'bloqueada',
];

// ─── Categorías que tienen prioridad HIGH por defecto ─────────────────────────
const HIGH_PRIORITY_SLUGS = ['infrastructure', 'security', 'database'];

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,

    @InjectRepository(TicketHistory)
    private readonly historyRepo: Repository<TicketHistory>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    private readonly dataSource: DataSource,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // CREAR TICKET — Transacción ACID completa
  // ───────────────────────────────────────────────────────────────────────────
  async create(dto: CreateTicketDto): Promise<Ticket> {
    // ── 1. Idempotencia: evitar duplicados por retries de Power Automate ──
    if (dto.idempotencyKey) {
      const existing = await this.ticketRepo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        console.log(`ℹ️  Ticket duplicado ignorado (idempotencyKey: ${dto.idempotencyKey})`);
        return existing;
      }
    }

    // ── 2. Validar usuario y categoría ANTES de abrir la transacción ──
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException(`Usuario con id ${dto.userId} no encontrado`);

    const category = await this.categoryRepo.findOne({
      where: { slug: dto.categorySlug },
    });
    if (!category) {
      throw new BadRequestException(`Categoría con slug "${dto.categorySlug}" no encontrada`);
    }

    // ── 3. Calcular código y prioridad ──
    const code     = await this.generateTicketCode();
    const priority = this.assignPriority(dto.categorySlug, dto.description);

    // ── 4. Abrir transacción ACID ──────────────────────────────────────────
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 4a. INSERT en tickets
      const ticket = queryRunner.manager.create(Ticket, {
        code,
        title:          dto.title,
        description:    dto.description,
        status:         TicketStatus.OPEN,
        priority,
        imageUrl:       dto.imageUrl,
        idempotencyKey: dto.idempotencyKey,
        category,
        createdBy:      user,
      });
      const savedTicket = await queryRunner.manager.save(ticket);

      // 4b. INSERT en ticket_history  ← si esto falla, el ticket NO se guarda
      const historyEntry = queryRunner.manager.create(TicketHistory, {
        ticket:     savedTicket,
        fromStatus: null,
        toStatus:   TicketStatus.OPEN,
        changedBy:  user,
        note:       'Ticket creado desde Power Apps',
      });
      await queryRunner.manager.save(historyEntry);

      // 4c. COMMIT — todo o nada
      await queryRunner.commitTransaction();
      console.log(`✅  Ticket creado: ${savedTicket.code} | Prioridad: ${savedTicket.priority}`);

      return this.findOne(savedTicket.id);

    } catch (error) {
      // ROLLBACK — garantiza consistencia ACID
      await queryRunner.rollbackTransaction();
      console.error('❌  Rollback ejecutado:', error.message);
      throw new InternalServerErrorException(
        'Error al crear el ticket. Transacción revertida.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LISTAR con filtros + paginación
  // ───────────────────────────────────────────────────────────────────────────
  async findAll(filters: FilterTicketsDto): Promise<{
    data: Ticket[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { status, priority, categorySlug, page = 1, limit = 20 } = filters;

    const qb = this.ticketRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.category',   'category')
      .leftJoinAndSelect('ticket.createdBy',  'createdBy')
      .leftJoinAndSelect('ticket.assignedTo', 'assignedTo')
      .orderBy('ticket.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status)       qb.andWhere('ticket.status = :status',       { status });
    if (priority)     qb.andWhere('ticket.priority = :priority',   { priority });
    if (categorySlug) qb.andWhere('category.slug = :categorySlug', { categorySlug });

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OBTENER UN TICKET por ID
  // ───────────────────────────────────────────────────────────────────────────
  async findOne(id: string): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id },
      relations: ['category', 'createdBy', 'assignedTo', 'history', 'history.changedBy'],
    });
    if (!ticket) throw new NotFoundException(`Ticket con id ${id} no encontrado`);
    return ticket;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CAMBIAR ESTADO — con registro de historial (también en transacción)
  // ───────────────────────────────────────────────────────────────────────────
  async updateStatus(id: string, dto: UpdateStatusDto) {
    const ticket = await this.findOne(id);
    const technician = await this.userRepo.findOne({ where: { id: dto.changedBy } });
    if (!technician) {
      throw new BadRequestException(`Técnico con id ${dto.changedBy} no encontrado`);
    }

    const previousStatus = ticket.status;

    if (previousStatus === dto.status) {
      throw new BadRequestException(
        `El ticket ya se encuentra en estado ${dto.status}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Actualizar el estado del ticket
      ticket.status = dto.status;
      if (dto.status === TicketStatus.RESOLVED) {
        ticket.resolvedAt = new Date();
      }
      await queryRunner.manager.save(ticket);

      // Registrar en historial (dispara el polling de n8n)
      const historyEntry = queryRunner.manager.create(TicketHistory, {
        ticket,
        fromStatus: previousStatus,
        toStatus:   dto.status,
        changedBy:  technician,
        note:       dto.note,
      });
      await queryRunner.manager.save(historyEntry);

      await queryRunner.commitTransaction();

      // Calcular tiempo de resolución si aplica
      let resolutionTimeHours: number | null = null;
      let slaMet: boolean | null = null;

      if (dto.status === TicketStatus.RESOLVED && ticket.resolvedAt) {
        const diffMs = ticket.resolvedAt.getTime() - ticket.createdAt.getTime();
        resolutionTimeHours = parseFloat((diffMs / 1000 / 3600).toFixed(2));
        slaMet = ticket.category
          ? resolutionTimeHours <= ticket.category.slaHours
          : null;
      }

      return {
        ticketId:            ticket.id,
        code:                ticket.code,
        previousStatus,
        newStatus:           dto.status,
        resolvedAt:          ticket.resolvedAt ?? null,
        resolutionTimeHours,
        slaMet,
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(
        'Error al actualizar el estado. Transacción revertida.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MÉTRICAS Y KPIs
  // ───────────────────────────────────────────────────────────────────────────
  async getMetrics() {
    const em = this.dataSource.manager;

    // KPI 1 — Volumen total por estado
    const byStatus = await em.query(`
      SELECT status, COUNT(*)::int AS total
      FROM tickets
      GROUP BY status
      ORDER BY total DESC
    `);

    // KPI 2 — Tiempo promedio de resolución por categoría (horas)
    const avgResolutionByCategory = await em.query(`
      SELECT
        c.name AS category,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric,
          2
        ) AS avg_resolution_hours,
        COUNT(t.id)::int AS resolved_tickets
      FROM tickets t
      JOIN categories c ON t.category_id = c.id
      WHERE t.status = 'RESOLVED' AND t.resolved_at IS NOT NULL
      GROUP BY c.name
      ORDER BY avg_resolution_hours ASC
    `);

    // KPI 3 — Tickets por prioridad
    const byPriority = await em.query(`
      SELECT priority, COUNT(*)::int AS total
      FROM tickets
      GROUP BY priority
      ORDER BY CASE priority
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH'     THEN 2
        WHEN 'MEDIUM'   THEN 3
        WHEN 'LOW'      THEN 4
      END
    `);

    // KPI 4 — Cumplimiento de SLA (tickets resueltos dentro del SLA vs fuera)
    const slaCompliance = await em.query(`
      SELECT
        c.name AS category,
        COUNT(t.id)::int AS total_resolved,
        SUM(CASE
          WHEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600 <= c.sla_hours
          THEN 1 ELSE 0
        END)::int AS within_sla,
        ROUND(
          100.0 * SUM(CASE
            WHEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600 <= c.sla_hours
            THEN 1 ELSE 0
          END) / NULLIF(COUNT(t.id), 0), 2
        ) AS sla_compliance_pct
      FROM tickets t
      JOIN categories c ON t.category_id = c.id
      WHERE t.status = 'RESOLVED' AND t.resolved_at IS NOT NULL
      GROUP BY c.name, c.sla_hours
      ORDER BY sla_compliance_pct DESC
    `);

    // KPI 5 — Tickets críticos abiertos hace más de 4 horas (alertas)
    const criticalOverdue = await em.query(`
      SELECT
        t.code, t.title, t.status, t.created_at,
        u.name AS owner_name, u.email AS owner_email,
        ROUND(
          EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600, 2
        ) AS hours_open
      FROM tickets t
      JOIN users u ON t.created_by = u.id
      WHERE t.priority = 'CRITICAL'
        AND t.status NOT IN ('RESOLVED', 'CLOSED')
        AND t.created_at < NOW() - INTERVAL '4 hours'
      ORDER BY t.created_at ASC
    `);

    // Conteos generales
    const totalTickets  = await this.ticketRepo.count();
    const openTickets   = await this.ticketRepo.count({ where: { status: TicketStatus.OPEN } });

    return {
      summary: {
        totalTickets,
        openTickets,
        criticalOverdueCount: criticalOverdue.length,
      },
      kpi1_byStatus:               byStatus,
      kpi2_avgResolutionByCategory: avgResolutionByCategory,
      kpi3_byPriority:             byPriority,
      kpi4_slaCompliance:          slaCompliance,
      kpi5_criticalOverdue:        criticalOverdue,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ENDPOINT PARA n8n — registros de historial recientes para polling
  // ───────────────────────────────────────────────────────────────────────────
  async getRecentHistory(sinceMinutes = 2) {
    return this.historyRepo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.ticket',    'ticket')
      .leftJoinAndSelect('h.changedBy', 'changedBy')
      .leftJoinAndSelect('ticket.createdBy', 'createdBy')
      .where(`h.created_at > NOW() - INTERVAL '${sinceMinutes} minutes'`)
      .orderBy('h.created_at', 'DESC')
      .getMany();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ───────────────────────────────────────────────────────────────────────────

  /** Genera código correlativo: TKT-2026-00001 */
  private async generateTicketCode(): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.ticketRepo.findOne({
      where: { code: Like(`TKT-${year}-%`) },
      order: { createdAt: 'DESC' },
    });

    const lastNumber = last ? parseInt(last.code.split('-')[2], 10) : 0;
    const next       = String(lastNumber + 1).padStart(5, '0');
    return `TKT-${year}-${next}`;
  }

  /** Calcula la prioridad basado en categoría y palabras clave en la descripción */
  private assignPriority(categorySlug: string, description: string): TicketPriority {
    const descLower = description.toLowerCase();
    const isCritical = CRITICAL_KEYWORDS.some((kw) => descLower.includes(kw));

    if (isCritical)                            return TicketPriority.CRITICAL;
    if (HIGH_PRIORITY_SLUGS.includes(categorySlug)) return TicketPriority.HIGH;
    if (categorySlug === 'software')           return TicketPriority.MEDIUM;
    return TicketPriority.LOW;
  }
}
