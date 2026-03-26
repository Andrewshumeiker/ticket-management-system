import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  slug: string;   // 'infrastructure', 'software', 'security'

  @Column({ name: 'sla_hours', default: 24 })
  slaHours: number;   // Horas de SLA por categoría

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
