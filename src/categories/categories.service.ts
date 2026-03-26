import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

// Categorías iniciales que se insertan si la tabla está vacía (seed automático)
const DEFAULT_CATEGORIES = [
  { name: 'Infraestructura', slug: 'infrastructure', slaHours: 4 },
  { name: 'Software',        slug: 'software',        slaHours: 8 },
  { name: 'Redes',           slug: 'networking',      slaHours: 6 },
  { name: 'Seguridad',       slug: 'security',        slaHours: 2 },
  { name: 'Hardware',        slug: 'hardware',        slaHours: 24 },
  { name: 'General',         slug: 'general',         slaHours: 48 },
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  /** Seed automático al iniciar la app */
  async onModuleInit() {
    const count = await this.categoryRepo.count();
    if (count === 0) {
      await this.categoryRepo.save(
        DEFAULT_CATEGORIES.map((c) => this.categoryRepo.create(c)),
      );
      console.log('✅  Categorías seed insertadas correctamente');
    }
  }

  async findAll(): Promise<Category[]> {
    return this.categoryRepo.find({ order: { id: 'ASC' } });
  }

  async findBySlug(slug: string): Promise<Category> {
    const cat = await this.categoryRepo.findOne({ where: { slug } });
    if (!cat) throw new NotFoundException(`Categoría con slug "${slug}" no encontrada`);
    return cat;
  }

  async findById(id: number): Promise<Category> {
    const cat = await this.categoryRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    return cat;
  }
}
