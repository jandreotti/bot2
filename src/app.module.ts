import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BotModule } from './bot/bot.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CronTasksModule } from './cron-tasks/cron-tasks.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CrawlerModule } from './crawler/crawler.module';

@Module({
  imports: [
    BotModule,

    //! Importo el modulo de EventEmitter para poder usarlo en toda la aplicacion
    //! https://muhesi.hashnode.dev/an-ultime-guide-to-create-a-whatsapp-bot-in-nestjs-framework
    EventEmitterModule.forRoot(),

    //! Importo el modulo de Schedule para poder usarlo en toda la aplicacion
    //! https://docs.nestjs.com/techniques/task-scheduling
    ScheduleModule.forRoot(),

    CronTasksModule,

    CrawlerModule,

    //! importo el modulo de logger
    // LoggerModule.forRoot({
    //   pinoHttp: {
    //     prettyPrint: true,
    //     customLogLevel: (res, err) => {
    //       if (res.statusCode >= 400) {
    //         return 'error';
    //       }
    //       return 'info';
    //     },
    //   },
    // }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
