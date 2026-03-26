import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsModule } from './tickets/tickets.module';
import { CategoriesModule } from './categories/categories.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // ── Variables de entorno disponibles en toda la app
    ConfigModule.forRoot({ isGlobal: true }),

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
        synchronize: true,   // AUTO-MIGRACIÓN (solo en desarrollo)
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    // ── Módulos de dominio
    UsersModule,
    CategoriesModule,
    TicketsModule,
  ],
})
export class AppModule {}
