import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>("REDIS_URL")?.trim();
    const redisReady =
      redisUrl &&
      !redisUrl.includes("...") &&
      (redisUrl.startsWith("redis://") || redisUrl.startsWith("rediss://"));

    if (redisReady) {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false
      });
      this.redis.on("error", (error: Error) => {
        this.logger.warn(`Redis rate-limit error: ${error.message}`);
      });
      void this.redis.connect().catch((error: Error) => {
        this.logger.warn(
          `Redis no disponible, rate-limit en memoria: ${error.message}`
        );
        void this.redis?.quit();
        this.redis = null;
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }

  async checkLimit(
    key: string,
    limit: number,
    windowSeconds = 60
  ): Promise<boolean> {
    if (this.redis) {
      try {
        return await this.checkRedis(key, limit, windowSeconds);
      } catch (error) {
        this.logger.warn(
          `Redis rate-limit fallback a memoria: ${(error as Error).message}`
        );
      }
    }
    return this.checkMemory(key, limit, windowSeconds);
  }

  private async checkRedis(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const pipeline = this.redis!.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    pipeline.zadd(redisKey, now, `${now}`);
    pipeline.zcard(redisKey);
    pipeline.expire(redisKey, windowSeconds);
    const results = await pipeline.exec();
    if (!results) {
      throw new Error("Redis pipeline vacío");
    }
    const count = (results[2]?.[1] as number) ?? 0;
    return count <= limit;
  }

  private checkMemory(
    key: string,
    limit: number,
    windowSeconds: number
  ): boolean {
    const now = Date.now();
    const entry = this.memory.get(key);

    if (!entry || entry.resetAt <= now) {
      this.memory.set(key, {
        count: 1,
        resetAt: now + windowSeconds * 1000
      });
      return true;
    }

    entry.count += 1;
    return entry.count <= limit;
  }
}
