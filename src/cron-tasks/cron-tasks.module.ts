import { Module } from '@nestjs/common';
import { CronTasksService } from './cron-tasks.service';
import { CrawlerModule } from 'src/crawler/crawler.module';
import { BotModule } from 'src/bot/bot.module';

@Module({
  imports: [
    //! Importo el modulo de Crawler para poder usar el servicio de DolarService
    CrawlerModule,

    //!
    BotModule,
  ],
  providers: [CronTasksService],
  exports: [CronTasksService],
})
export class CronTasksModule {}
