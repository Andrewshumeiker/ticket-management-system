import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiKeyMiddleware } from '../src/common/middleware/api-key.middleware';
import { TicketPriority, TicketStatus } from '../src/common/enums/ticket.enum';
import { TicketsController } from '../src/tickets/tickets.controller';
import { TicketsService } from '../src/tickets/tickets.service';

const API_KEY = 'test-api-key-with-at-least-24-characters';
const ticket = {
  id: 'e2cf97b5-0b04-4050-bf97-93ca5b1a8217',
  code: 'TKT-2026-00001',
  title: 'Error de autenticación',
  description: 'El usuario no puede iniciar sesión',
  status: TicketStatus.OPEN,
  priority: TicketPriority.MEDIUM,
};

const ticketsServiceMock = {
  create: jest.fn().mockResolvedValue(ticket),
  findAll: jest.fn(),
  findOne: jest.fn(),
  updateStatus: jest.fn(),
  getMetrics: jest.fn(),
  getRecentHistory: jest.fn(),
};

@Module({
  controllers: [TicketsController],
  providers: [
    { provide: TicketsService, useValue: ticketsServiceMock },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => (key === 'API_KEY' ? API_KEY : undefined),
      },
    },
  ],
})
class TestTicketsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes(TicketsController);
  }
}

describe('Tickets API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestTicketsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests without an API key', async () => {
    await request(app.getHttpServer()).get('/api/v1/tickets').expect(401);
  });

  it('creates a validated ticket', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tickets')
      .set('x-api-key', API_KEY)
      .send({
        title: ticket.title,
        description: ticket.description,
        categorySlug: 'software',
        userId: '7b6a2754-fdc4-49f5-b9d6-f20c94364e32',
        idempotencyKey: 'request-1',
      })
      .expect(201);

    expect(response.body).toMatchObject(ticket);
    expect(ticketsServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it('rejects fields outside the DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tickets')
      .set('x-api-key', API_KEY)
      .send({
        title: ticket.title,
        description: ticket.description,
        categorySlug: 'software',
        userId: '7b6a2754-fdc4-49f5-b9d6-f20c94364e32',
        unexpectedAdminFlag: true,
      })
      .expect(400);
  });
});
