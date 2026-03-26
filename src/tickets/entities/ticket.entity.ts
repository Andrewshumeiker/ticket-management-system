import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User }           from '../../users/entities/user.entity';
import { Category }       from '../../categories/entities/category.entity';
import { TicketHistory }  from './ticket-history.entity';
import { TicketStatus, TicketPriority } from '../../common/enums/ticket.enum';

@Entity('tickets')
@Index(['status'])
@Index(['priority'])
@Index(['createdAt'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Código legible: TKT-2026-00001 */
  @Column({ length: 20, unique: true })
  code: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Column({
    type: 'varchar',
    length: 10,
    default: TicketPriority.MEDIUM,
  })
  priority: TicketPriority;

  /** URL de la imagen en Cloudinary / S3 */
  @Column({ name: 'image_url', length: 500, nullable: true })
  imageUrl: string;

  /** Clave de idempotencia enviada por Power Automate para evitar duplicados */
  @Column({ name: 'idempotency_key', length: 100, unique: true, nullable: true })
  idempotencyKey: string;

  /** FK → categories */
  @ManyToOne(() => Category, { eager: true, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  /** FK → users (quien creó el ticket) */
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  /** FK → users (técnico asignado) */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignedTo: User;

  /** Historial de cambios de estado */
  @OneToMany(() => TicketHistory, (h) => h.ticket)
  history: TicketHistory[];

  /** Timestamp cuando el ticket pasó a RESOLVED */
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
