import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { CrawlerModule } from 'src/crawler/crawler.module';

@Module({
  imports: [

    //! Importo el modulo de Crawler para poder usar el servicio de DolarService
    CrawlerModule
  ],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService]
})
export class BotModule { }
