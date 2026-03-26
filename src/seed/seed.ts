/**
 * Script de seed para insertar datos de prueba.
 * Ejecutar: npx ts-node src/seed/seed.ts
 *
 * Alternativa: el seed de categorías se ejecuta automáticamente
 * en CategoriesService.onModuleInit() al iniciar la app.
 *
 * Este script crea usuarios de prueba y tickets de ejemplo
 * para demostrar el sistema funcionando.
 */

import { DataSource } from 'typeorm';
import { User }     from '../users/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Ticket }   from '../tickets/entities/ticket.entity';
import { TicketHistory } from '../tickets/entities/ticket-history.entity';
import { TicketStatus, TicketPriority } from '../common/enums/ticket.enum';

async function seed() {
  const ds = new DataSource({
    type:        'postgres',
    host:        process.env.DB_HOST ?? 'localhost',
    port:        parseInt(process.env.DB_PORT ?? '5432'),
    username:    process.env.DB_USER ?? 'postgres',
    password:    process.env.DB_PASS ?? 'postgres',
    database:    process.env.DB_NAME ?? 'tickets_db',
    entities:    [User, Category, Ticket, TicketHistory],
    synchronize: true,
  });

  await ds.initialize();
  console.log('📦  Conexión a DB establecida.\n');

  const userRepo    = ds.getRepository(User);
  const categoryRepo = ds.getRepository(Category);
  const ticketRepo  = ds.getRepository(Ticket);
  const historyRepo = ds.getRepository(TicketHistory);

  // ── 1. Usuarios ──────────────────────────────────────────────────────
  const users = await userRepo.save([
    {
      name: 'Carlos Mendoza',
      email: 'carlos.mendoza@empresa.com',
      phone: '+573001234567',
      department: 'Operaciones',
    },
    {
      name: 'Ana García',
      email: 'ana.garcia@empresa.com',
      phone: '+573009876543',
      department: 'Infraestructura TI',
    },
    {
      name: 'Luis Ramírez',
      email: 'luis.ramirez@empresa.com',
      phone: '+573005551234',
      department: 'Desarrollo',
    },
  ]);
  console.log(`👤  ${users.length} usuarios creados`);

  // ── 2. Categorías (se crean automáticamente en la app, pero por seguridad)
  let categories = await categoryRepo.find();
  if (categories.length === 0) {
    categories = await categoryRepo.save([
      { name: 'Infraestructura', slug: 'infrastructure', slaHours: 4 },
      { name: 'Software',        slug: 'software',        slaHours: 8 },
      { name: 'Redes',           slug: 'networking',      slaHours: 6 },
      { name: 'Seguridad',       slug: 'security',        slaHours: 2 },
      { name: 'Hardware',        slug: 'hardware',        slaHours: 24 },
      { name: 'General',         slug: 'general',         slaHours: 48 },
    ]);
    console.log(`📁  ${categories.length} categorías creadas`);
  } else {
    console.log(`📁  ${categories.length} categorías ya existían`);
  }

  const catInfra    = categories.find((c) => c.slug === 'infrastructure')!;
  const catSoftware = categories.find((c) => c.slug === 'software')!;
  const catSecurity = categories.find((c) => c.slug === 'security')!;

  // ── 3. Tickets de ejemplo ────────────────────────────────────────────
  const tickets = await ticketRepo.save([
    {
      code:        'TKT-2026-00001',
      title:       'Servidor principal caído — producción no responde',
      description: 'Desde las 9am el servidor principal muestra timeout. Urgente.',
      status:      TicketStatus.OPEN,
      priority:    TicketPriority.CRITICAL,
      imageUrl:    'https://res.cloudinary.com/demo/image/upload/sample_evidence.jpg',
      category:    catInfra,
      createdBy:   users[0],
    },
    {
      code:        'TKT-2026-00002',
      title:       'Actualizar versión de Node.js en servidores de staging',
      description: 'Se necesita actualizar Node de la v18 a la v20 LTS.',
      status:      TicketStatus.IN_PROGRESS,
      priority:    TicketPriority.MEDIUM,
      category:    catSoftware,
      createdBy:   users[2],
      assignedTo:  users[1],
    },
    {
      code:        'TKT-2026-00003',
      title:       'Acceso no autorizado detectado en firewall',
      description: 'Se detectaron 200 intentos de login fallidos desde IP 45.33.xx.xx',
      status:      TicketStatus.OPEN,
      priority:    TicketPriority.CRITICAL,
      category:    catSecurity,
      createdBy:   users[1],
    },
  ]);
  console.log(`🎫  ${tickets.length} tickets creados`);

  // ── 4. Historial ─────────────────────────────────────────────────────
  await historyRepo.save([
    {
      ticket:     tickets[0],
      fromStatus: null,
      toStatus:   TicketStatus.OPEN,
      changedBy:  users[0],
      note:       'Ticket creado desde Power Apps',
    },
    {
      ticket:     tickets[1],
      fromStatus: null,
      toStatus:   TicketStatus.OPEN,
      changedBy:  users[2],
      note:       'Ticket creado desde Power Apps',
    },
    {
      ticket:     tickets[1],
      fromStatus: TicketStatus.OPEN,
      toStatus:   TicketStatus.IN_PROGRESS,
      changedBy:  users[1],
      note:       'Asignado al equipo de infraestructura',
    },
    {
      ticket:     tickets[2],
      fromStatus: null,
      toStatus:   TicketStatus.OPEN,
      changedBy:  users[1],
      note:       'Ticket creado — incidente de seguridad',
    },
  ]);
  console.log(`📜  Historial de tickets creado`);

  console.log('\n✅  Seed completado exitosamente.\n');
  await ds.destroy();
}

seed().catch((err) => {
  console.error('❌  Error en seed:', err);
  process.exit(1);
});
