import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Like, Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { TicketPriority, TicketStatus } from '../common/enums/ticket.enum';
import { User } from '../users/entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { TicketHistory } from './entities/ticket-history.entity';
import { Ticket } from './entities/ticket.entity';

const CRITICAL_KEYWORDS = [
  'caído',
  'caido',
  'caída',
  'producción',
  'produccion',
  'pérdida de datos',
  'urgente',
  'crítico',
  'critico',
  'no funciona',
  'bloqueado',
  'bloqueada',
];

const HIGH_PRIORITY_SLUGS = ['infrastructure', 'security', 'database'];

const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.PENDING],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.PENDING, TicketStatus.RESOLVED],
  [TicketStatus.PENDING]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

type CountMetric = { total: number } & Record<string, unknown>;
type CriticalTicketMetric = {
  code: string;
  title: string;
  status: TicketStatus;
  created_at: Date;
  owner_name: string;
  owner_email: string;
  hours_open: string;
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

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

  async create(dto: CreateTicketDto): Promise<Ticket> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let ticketId: string | undefined;

    try {
      if (dto.idempotencyKey) {
        await this.acquireTransactionLock(
          queryRunner.manager,
          `ticket-idempotency:${dto.idempotencyKey}`,
        );
        const existing = await queryRunner.manager.findOne(Ticket, {
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing) {
          await queryRunner.commitTransaction();
          return existing;
        }
      }

      const user = await queryRunner.manager.findOne(User, {
        where: { id: dto.userId },
      });
      const category = await queryRunner.manager.findOne(Category, {
        where: { slug: dto.categorySlug },
      });

      if (!user) {
        throw new BadRequestException(
          `Usuario con id ${dto.userId} no encontrado`,
        );
      }
      if (!category) {
        throw new BadRequestException(
          `Categoría con slug "${dto.categorySlug}" no encontrada`,
        );
      }

      const ticket = queryRunner.manager.create(Ticket, {
        code: await this.generateTicketCode(queryRunner.manager),
        title: dto.title,
        description: dto.description,
        status: TicketStatus.OPEN,
        priority: this.assignPriority(dto.categorySlug, dto.description),
        imageUrl: dto.imageUrl ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
        category,
        createdBy: user,
      });
      const savedTicket = await queryRunner.manager.save(ticket);

      await queryRunner.manager.save(
        queryRunner.manager.create(TicketHistory, {
          ticket: savedTicket,
          fromStatus: null,
          toStatus: TicketStatus.OPEN,
          changedBy: user,
          note: 'Ticket creado desde Power Apps',
        }),
      );

      await queryRunner.commitTransaction();
      ticketId = savedTicket.id;
      this.logger.log(`Ticket created: ${savedTicket.code}`);
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        'Ticket transaction rolled back',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Error al crear el ticket. Transacción revertida.',
      );
    } finally {
      await queryRunner.release();
    }

    if (!ticketId) {
      throw new InternalServerErrorException('No se pudo crear el ticket');
    }
    return this.findOne(ticketId);
  }

  async findAll(filters: FilterTicketsDto): Promise<{
    data: Ticket[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { status, priority, categorySlug, page = 1, limit = 20 } = filters;
    const query = this.ticketRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.category', 'category')
      .leftJoinAndSelect('ticket.createdBy', 'createdBy')
      .leftJoinAndSelect('ticket.assignedTo', 'assignedTo')
      .orderBy('ticket.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) query.andWhere('ticket.status = :status', { status });
    if (priority) query.andWhere('ticket.priority = :priority', { priority });
    if (categorySlug) {
      query.andWhere('category.slug = :categorySlug', { categorySlug });
    }

    const [data, total] = await query.getManyAndCount();
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

  async findOne(id: string): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id },
      relations: [
        'category',
        'createdBy',
        'assignedTo',
        'history',
        'history.changedBy',
      ],
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket con id ${id} no encontrado`);
    }
    return ticket;
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.acquireTransactionLock(
        queryRunner.manager,
        `ticket-status:${id}`,
      );
      const ticket = await queryRunner.manager.findOne(Ticket, {
        where: { id },
        relations: ['category'],
      });
      if (!ticket) {
        throw new NotFoundException(`Ticket con id ${id} no encontrado`);
      }

      const technician = await queryRunner.manager.findOne(User, {
        where: { id: dto.changedBy },
      });
      if (!technician) {
        throw new BadRequestException(
          `Técnico con id ${dto.changedBy} no encontrado`,
        );
      }

      const previousStatus = ticket.status;
      if (!ALLOWED_STATUS_TRANSITIONS[previousStatus].includes(dto.status)) {
        throw new BadRequestException(
          `Transición no permitida: ${previousStatus} -> ${dto.status}`,
        );
      }

      ticket.status = dto.status;
      if (dto.status === TicketStatus.RESOLVED) {
        ticket.resolvedAt = new Date();
      }
      await queryRunner.manager.save(ticket);
      await queryRunner.manager.save(
        queryRunner.manager.create(TicketHistory, {
          ticket,
          fromStatus: previousStatus,
          toStatus: dto.status,
          changedBy: technician,
          note: dto.note ?? null,
        }),
      );

      await queryRunner.commitTransaction();
      const resolutionTimeHours = ticket.resolvedAt
        ? Number(
            (
              (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) /
              3_600_000
            ).toFixed(2),
          )
        : null;

      return {
        ticketId: ticket.id,
        code: ticket.code,
        previousStatus,
        newStatus: dto.status,
        resolvedAt: ticket.resolvedAt,
        resolutionTimeHours,
        slaMet:
          resolutionTimeHours === null
            ? null
            : resolutionTimeHours <= ticket.category.slaHours,
      };
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        'Status transaction rolled back',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Error al actualizar el estado. Transacción revertida.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getMetrics() {
    const manager = this.dataSource.manager;
    const byStatus = await this.queryRows<CountMetric>(
      manager,
      `SELECT status, COUNT(*)::int AS total
       FROM tickets GROUP BY status ORDER BY total DESC`,
    );
    const avgResolutionByCategory = await this.queryRows<CountMetric>(
      manager,
      `SELECT c.name AS category,
              ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 2) AS avg_resolution_hours,
              COUNT(t.id)::int AS resolved_tickets
       FROM tickets t JOIN categories c ON t.category_id = c.id
       WHERE t.status = 'RESOLVED' AND t.resolved_at IS NOT NULL
       GROUP BY c.name ORDER BY avg_resolution_hours ASC`,
    );
    const byPriority = await this.queryRows<CountMetric>(
      manager,
      `SELECT priority, COUNT(*)::int AS total
       FROM tickets GROUP BY priority
       ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END`,
    );
    const slaCompliance = await this.queryRows<CountMetric>(
      manager,
      `SELECT c.name AS category,
              COUNT(t.id)::int AS total_resolved,
              SUM(CASE WHEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600 <= c.sla_hours THEN 1 ELSE 0 END)::int AS within_sla,
              ROUND(100.0 * SUM(CASE WHEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600 <= c.sla_hours THEN 1 ELSE 0 END) / NULLIF(COUNT(t.id), 0), 2) AS sla_compliance_pct
       FROM tickets t JOIN categories c ON t.category_id = c.id
       WHERE t.status = 'RESOLVED' AND t.resolved_at IS NOT NULL
       GROUP BY c.name, c.sla_hours ORDER BY sla_compliance_pct DESC`,
    );
    const criticalOverdue = await this.queryRows<CriticalTicketMetric>(
      manager,
      `SELECT t.code, t.title, t.status, t.created_at,
              u.name AS owner_name, u.email AS owner_email,
              ROUND(EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600, 2) AS hours_open
       FROM tickets t JOIN users u ON t.created_by = u.id
       WHERE t.priority = 'CRITICAL'
         AND t.status NOT IN ('RESOLVED', 'CLOSED')
         AND t.created_at < NOW() - INTERVAL '4 hours'
       ORDER BY t.created_at ASC`,
    );

    const [totalTickets, openTickets] = await Promise.all([
      this.ticketRepo.count(),
      this.ticketRepo.count({ where: { status: TicketStatus.OPEN } }),
    ]);

    return {
      summary: {
        totalTickets,
        openTickets,
        criticalOverdueCount: criticalOverdue.length,
      },
      kpi1_byStatus: byStatus,
      kpi2_avgResolutionByCategory: avgResolutionByCategory,
      kpi3_byPriority: byPriority,
      kpi4_slaCompliance: slaCompliance,
      kpi5_criticalOverdue: criticalOverdue,
    };
  }

  async getRecentHistory(sinceMinutes = 2) {
    const safeMinutes = Math.min(Math.max(sinceMinutes, 1), 1_440);
    return this.historyRepo
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.ticket', 'ticket')
      .leftJoinAndSelect('history.changedBy', 'changedBy')
      .leftJoinAndSelect('ticket.createdBy', 'createdBy')
      .where(`history.created_at > NOW() - (:minutes * INTERVAL '1 minute')`, {
        minutes: safeMinutes,
      })
      .orderBy('history.created_at', 'DESC')
      .getMany();
  }

  private async generateTicketCode(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    await this.acquireTransactionLock(manager, `ticket-code:${year}`);
    const last = await manager.findOne(Ticket, {
      where: { code: Like(`TKT-${year}-%`) },
      order: { code: 'DESC' },
    });
    const lastNumber = last ? Number(last.code.split('-')[2]) : 0;
    return `TKT-${year}-${String(lastNumber + 1).padStart(5, '0')}`;
  }

  private assignPriority(
    categorySlug: string,
    description: string,
  ): TicketPriority {
    const normalizedDescription = description.toLocaleLowerCase('es');
    if (
      CRITICAL_KEYWORDS.some((keyword) =>
        normalizedDescription.includes(keyword),
      )
    ) {
      return TicketPriority.CRITICAL;
    }
    if (HIGH_PRIORITY_SLUGS.includes(categorySlug)) {
      return TicketPriority.HIGH;
    }
    if (categorySlug === 'software') {
      return TicketPriority.MEDIUM;
    }
    return TicketPriority.LOW;
  }

  private async acquireTransactionLock(
    manager: EntityManager,
    key: string,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  }

  private async queryRows<T>(
    manager: EntityManager,
    sql: string,
  ): Promise<T[]> {
    return (await manager.query(sql)) as unknown as T[];
  }
}
