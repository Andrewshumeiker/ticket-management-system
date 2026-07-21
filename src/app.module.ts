import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsModule } from './tickets/tickets.module';
import { CategoriesModule } from './categories/categories.module';
import { UsersModule } from './users/users.module';
import { validateEnvironment } from './config/env.validation';
import { ApiKeyMiddleware } from './common/middleware/api-key.middleware';
import { TicketsController } from './tickets/tickets.controller';
import { UsersController } from './users/users.controller';
import { CategoriesController } from './categories/categories.controller';

@Module({
  imports: [
    // ── Variables de entorno disponibles en toda la app
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),

    // ── Conexión TypeORM → PostgreSQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASS', 'postgres'),
        database: config.get('DB_NAME', 'tickets_db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        synchronize:
          config.get<string>('NODE_ENV') !== 'production' &&
          config.get<string>('DB_SYNC', 'false') === 'true',
        logging: config.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),

    // ── Módulos de dominio
    UsersModule,
    CategoriesModule,
    TicketsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiKeyMiddleware)
      .forRoutes(TicketsController, UsersController, CategoriesController);
  }
}
