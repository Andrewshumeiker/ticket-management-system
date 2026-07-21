import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { TicketHistory } from '../tickets/entities/ticket-history.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const AppDataSource = new DataSource({
  type: 'postgres',
  host: requiredEnvironmentVariable('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 5432),
  username: requiredEnvironmentVariable('DB_USER'),
  password: requiredEnvironmentVariable('DB_PASS'),
  database: requiredEnvironmentVariable('DB_NAME'),
  entities: [User, Category, Ticket, TicketHistory],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  synchronize: false,
});

export default AppDataSource;
