import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BotModule } from './bot/bot.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    BotModule,

    //! Importo el modulo de EventEmitter para poder usarlo en toda la aplicacion
    EventEmitterModule.forRoot()
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
