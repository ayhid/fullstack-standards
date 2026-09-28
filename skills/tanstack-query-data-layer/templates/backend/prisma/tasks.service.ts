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
      await tx.project.update({
        where: { id: dto.projectId },
        data: { taskCount: { increment: 1 } },
      });
      return task;
    });
  }

  async update(id: number, dto: UpdateTaskDto): Promise<Task> {
    await this.findById(id);
    return this.prisma.task.update({ where: { id }, data: dto });
  }

  async remove(id: number): Promise<void> {
    await this.findById(id);
    await this.prisma.task.delete({ where: { id } });
  }

  // Anything a transaction calls takes `tx`, not the injected client —
  // otherwise it runs outside the transaction.
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
