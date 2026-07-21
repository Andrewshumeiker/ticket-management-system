import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner, Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { TicketPriority, TicketStatus } from '../common/enums/ticket.enum';
import { User } from '../users/entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketHistory } from './entities/ticket-history.entity';
import { Ticket } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';

const user = {
  id: '7b6a2754-fdc4-49f5-b9d6-f20c94364e32',
  name: 'Ana',
  email: 'ana@example.com',
} as User;

const category = {
  id: 1,
  name: 'Software',
  slug: 'software',
  slaHours: 24,
} as Category;

const baseTicket = {
  id: 'e2cf97b5-0b04-4050-bf97-93ca5b1a8217',
  code: 'TKT-2026-00001',
  title: 'Error de autenticación',
  description: 'El usuario no puede iniciar sesión',
  status: TicketStatus.OPEN,
  priority: TicketPriority.MEDIUM,
  category,
  createdBy: user,
  assignedTo: null,
  resolvedAt: null,
  createdAt: new Date('2026-07-20T12:00:00Z'),
  updatedAt: new Date('2026-07-20T12:00:00Z'),
  imageUrl: null,
  idempotencyKey: 'request-1',
  history: [],
} as Ticket;

type ManagerMocks = {
  query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  findOne: jest.Mock<Promise<unknown>, [unknown, unknown]>;
  create: jest.Mock<unknown, [unknown, unknown]>;
  save: jest.Mock<Promise<unknown>, [unknown]>;
};

function createFixture() {
  const ticketRepo = {
    findOne: jest.fn().mockResolvedValue(baseTicket),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Ticket>;
  const historyRepo = {
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<TicketHistory>;
  const userRepo = {} as Repository<User>;
  const categoryRepo = {} as Repository<Category>;

  const manager: ManagerMocks = {
    query: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (value: unknown) => {
      if (isTicketInput(value)) {
        return { ...baseTicket, ...value };
      }
      return value;
    }),
  };
  const queryRunner = {
    manager: manager as unknown as EntityManager,
    isTransactionActive: true,
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockImplementation(async () => {
      queryRunner.isTransactionActive = false;
    }),
    rollbackTransaction: jest.fn().mockImplementation(async () => {
      queryRunner.isTransactionActive = false;
    }),
    release: jest.fn().mockResolvedValue(undefined),
  } as unknown as QueryRunner & { isTransactionActive: boolean };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
  } as unknown as DataSource;

  return {
    service: new TicketsService(
      ticketRepo,
      historyRepo,
      userRepo,
      categoryRepo,
      dataSource,
    ),
    manager,
    queryRunner,
  };
}

describe('TicketsService', () => {
  const dto: CreateTicketDto = {
    title: 'Error de autenticación',
    description: 'El usuario no puede iniciar sesión',
    categorySlug: 'software',
    userId: user.id,
    idempotencyKey: 'request-1',
  };

  it('returns the existing ticket for a repeated idempotency key', async () => {
    const { service, manager, queryRunner } = createFixture();
    manager.findOne.mockResolvedValueOnce(baseTicket);

    await expect(service.create(dto)).resolves.toBe(baseTicket);
    expect(manager.save).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('creates the ticket and history atomically', async () => {
    const { service, manager, queryRunner } = createFixture();
    manager.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(category)
      .mockResolvedValueOnce(null);

    const result = await service.create(dto);

    expect(result.id).toBe(baseTicket.id);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('assigns critical priority when the description indicates an outage', async () => {
    const { service, manager } = createFixture();
    manager.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(category)
      .mockResolvedValueOnce(null);

    await service.create({
      ...dto,
      description: 'Producción está caída y el equipo está bloqueado',
    });

    const savedTicket = manager.save.mock.calls[0][0] as Ticket;
    expect(savedTicket.priority).toBe(TicketPriority.CRITICAL);
  });

  it('rejects an invalid status transition and rolls back', async () => {
    const { service, manager, queryRunner } = createFixture();
    manager.findOne
      .mockResolvedValueOnce({ ...baseTicket, status: TicketStatus.OPEN })
      .mockResolvedValueOnce(user);

    await expect(
      service.updateStatus(baseTicket.id, {
        status: TicketStatus.CLOSED,
        changedBy: user.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('records a valid status transition', async () => {
    const { service, manager, queryRunner } = createFixture();
    manager.findOne
      .mockResolvedValueOnce({ ...baseTicket, status: TicketStatus.OPEN })
      .mockResolvedValueOnce(user);

    const result = await service.updateStatus(baseTicket.id, {
      status: TicketStatus.IN_PROGRESS,
      changedBy: user.id,
      note: 'Diagnóstico iniciado',
    });

    expect(result.previousStatus).toBe(TicketStatus.OPEN);
    expect(result.newStatus).toBe(TicketStatus.IN_PROGRESS);
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});

function isTicketInput(value: unknown): value is Partial<Ticket> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    'description' in value
  );
}
