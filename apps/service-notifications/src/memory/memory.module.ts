import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DebtorMemoryService } from "./debtor-memory.service";

@Module({
  imports: [ConfigModule],
  providers: [DebtorMemoryService],
  exports: [DebtorMemoryService]
})
export class MemoryModule {}
