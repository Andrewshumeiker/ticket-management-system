import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket }        from './entities/ticket.entity';
import { TicketHistory } from './entities/ticket-history.entity';
import { User }          from '../users/entities/user.entity';
import { Category }      from '../categories/entities/category.entity';
import { TicketsService }    from './tickets.service';
import { TicketsController } from './tickets.controller';
import { ApiKeyMiddleware }  from '../common/middleware/api-key.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketHistory, User, Category]),
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule implements NestModule {
  /** Aplica API Key middleware solo a las rutas de tickets */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes(TicketsController);
  }
}
