import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ticket } from './ticket.entity';
import { User } from '../../users/entities/user.entity';
import { TicketStatus } from '../../common/enums/ticket.enum';

@Entity('ticket_history')
@Index(['createdAt']) // n8n hace polling sobre esta columna
export class TicketHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK → tickets (CASCADE DELETE) */
  @ManyToOne(() => Ticket, (t) => t.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @Column({ type: 'varchar', name: 'from_status', length: 20, nullable: true })
  fromStatus: TicketStatus | null;

  @Column({ type: 'varchar', name: 'to_status', length: 20 })
  toStatus: TicketStatus;

  /** FK → users (quién hizo el cambio) */
  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by' })
  changedBy: User;

  /** Nota opcional del técnico */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
