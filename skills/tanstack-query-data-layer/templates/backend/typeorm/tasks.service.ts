import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Project, Task } from '../database/entities';
import { CreateTaskDto, UpdateTaskDto, ListTasksQuery } from './dto';

const SORTABLE_COLUMNS = new Set(['title', 'status', 'createdAt']);

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: ListTasksQuery): Promise<Paginated<Task>> {
    const { page = 1, pageSize = 25, search, sortBy, order = 'ASC' } = query;

    const qb = this.taskRepository.createQueryBuilder('task');
    if (search) {
      qb.andWhere('task.title ILIKE :search', { search: `%${search}%` });
    }
    // Whitelist: never interpolate a client-supplied column name.
    if (sortBy && SORTABLE_COLUMNS.has(sortBy)) {
      qb.orderBy(`task.${sortBy}`, order);
    }

    const [data, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findById(id: number): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  /** Creates the task and bumps the project's counter atomically. */
  async create(dto: CreateTaskDto): Promise<Task> {
    return this.dataSource.transaction(async manager => {
      await this.assertProjectExists(manager, dto.projectId);
      const task = await manager.save(manager.create(Task, dto));
      await manager.increment(Project, { id: dto.projectId }, 'taskCount', 1);
      return task;
    });
  }

  /** Moving a task to another project moves one unit between the counters. */
  async update(id: number, dto: UpdateTaskDto): Promise<Task> {
    return this.dataSource.transaction(async manager => {
      const task = await this.findTaskOrThrow(manager, id);
      if (dto.projectId !== undefined && dto.projectId !== task.projectId) {
        await this.assertProjectExists(manager, dto.projectId);
        await manager.decrement(Project, { id: task.projectId }, 'taskCount', 1);
        await manager.increment(Project, { id: dto.projectId }, 'taskCount', 1);
      }
      return manager.save(Task, { ...task, ...dto });
    });
  }

  /** Deletes the task and decrements the project's counter atomically. */
  async remove(id: number): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const task = await this.findTaskOrThrow(manager, id);
      await manager.remove(task);
      await manager.decrement(Project, { id: task.projectId }, 'taskCount', 1);
    });
  }

  // Anything a transaction calls takes the EntityManager, not the injected repo.
  private async findTaskOrThrow(manager: EntityManager, id: number): Promise<Task> {
    const task = await manager.findOne(Task, { where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  private async assertProjectExists(
    manager: EntityManager,
    projectId: number,
  ): Promise<void> {
    const exists = await manager.exists(Project, { where: { id: projectId } });
    if (!exists) {
      throw new BadRequestException(`Project ${projectId} does not exist`);
    }
  }
}
