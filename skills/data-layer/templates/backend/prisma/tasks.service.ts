import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
// Prisma 7+: import from your generator's `output` path.
import type { Prisma, Task } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, ListTasksQuery, UpdateTaskDto } from './dto';

const SORTABLE_COLUMNS = new Set<keyof Task>(['title', 'status', 'createdAt']);

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListTasksQuery): Promise<Paginated<Task>> {
    const { page = 1, pageSize = 25, search, sortBy, order = 'ASC' } = query;

    const where: Prisma.TaskWhereInput = search
      ? { title: { contains: search, mode: 'insensitive' } }
      : {};
    // Whitelist: never pass a client-supplied field name through unchecked.
    const orderBy =
      sortBy && SORTABLE_COLUMNS.has(sortBy as keyof Task)
        ? { [sortBy]: order === 'DESC' ? 'desc' : 'asc' }
        : undefined;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findById(id: number): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  /** Creates the task and bumps the project's counter atomically. */
  async create(dto: CreateTaskDto): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertProjectExists(tx, dto.projectId);
      const task = await tx.task.create({ data: dto });
      await this.bumpTaskCount(tx, dto.projectId, 1);
      return task;
    });
  }

  /** Moving a task to another project moves one unit between the counters. */
  async update(id: number, dto: UpdateTaskDto): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTaskOrThrow(tx, id);
      if (dto.projectId !== undefined && dto.projectId !== task.projectId) {
        await this.assertProjectExists(tx, dto.projectId);
        await this.bumpTaskCount(tx, task.projectId, -1);
        await this.bumpTaskCount(tx, dto.projectId, 1);
      }
      return tx.task.update({ where: { id }, data: dto });
    });
  }

  /** Deletes the task and decrements the project's counter atomically. */
  async remove(id: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const task = await this.findTaskOrThrow(tx, id);
      await tx.task.delete({ where: { id } });
      await this.bumpTaskCount(tx, task.projectId, -1);
    });
  }

  // Anything a transaction calls takes `tx`, not the injected client —
  // otherwise it runs outside the transaction.
  // Prisma has no row-lock API, so take it with raw SQL: a concurrent
  // update/remove of the same task waits instead of reading the old projectId
  // and moving its counter twice. Use the @@map table name if the model has one.
  private async findTaskOrThrow(
    tx: Prisma.TransactionClient,
    id: number,
  ): Promise<Task> {
    await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${id} FOR UPDATE`;
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  private async bumpTaskCount(
    tx: Prisma.TransactionClient,
    projectId: number,
    by: 1 | -1,
  ): Promise<void> {
    await tx.project.update({
      where: { id: projectId },
      data: { taskCount: { increment: by } },
    });
  }

  private async assertProjectExists(
    tx: Prisma.TransactionClient,
    projectId: number,
  ): Promise<void> {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException(`Project ${projectId} does not exist`);
    }
  }
}
