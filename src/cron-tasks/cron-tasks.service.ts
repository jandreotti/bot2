import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotService } from 'src/bot/bot.service';
import { cels } from 'src/bot/data/cels';
import { DolarService } from 'src/crawler/dolar.service';

// const EVERY_SECOND = '* * * * * *';
// const EVERY_MINUTE = '* * * * *';

@Injectable()
export class CronTasksService {
  constructor(
    //! Inyecto el EventEmitter2 para poder usarlo
    private eventEmitter: EventEmitter2,

    //! Inyecto el servicio de Dolar para poder usarlo
    private readonly dolarService: DolarService,

    //! Inyecto el servicio de Bot para poder usarlo
    private readonly botService: BotService,
  ) {}

  // * * * * * *
  // | | | | | |
  // | | | | | day of week
  // | | | | months
  // | | | day of month
  // | | hours
  // | minutes
  // seconds (optional)

  // @Cron(EVERY_MINUTE)
  // @Interval(10000) // Called every 10 seconds
  // @Timeout(5000) // Called once after 5 seconds
  // @Cron(CronExpression.EVERY_MINUTE) //! Copado! Tiene muchisimas expresiones
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronEvery5Min() {
    // this.eventEmitter.emit('cron.every-5-min');

    // const { fecha, compra, venta } = await this.dolarService.checkearDolarFetch();
    // console.log(`Hora!!!: ${fecha.toLocaleTimeString()}`, { compra, venta });

    // await this.dolarService.checkearDolarFetch();
    // const { fecha, compra, venta } = this.dolarService.getEstadoDolar();
    // console.log(`Hora!!!: ${fecha.toLocaleTimeString()}`, { compra, venta });

    const res = await this.dolarService.checkearDolarFetch();
    const {
      fecha,
      compra,
      venta,
      change,
      error,
      fechaLastChange,
      compraLastChange,
      ventaLastChange,
    } = res;

    console.log({ res });

    const diferenciaCompra = compra - compraLastChange;
    const diferenciaVenta = venta - ventaLastChange;

    const text = `Cambio la cotizacion del dolar (CORDOBA):

Compra: $${compra} (${diferenciaCompra > 0 ? '+' : ''}${diferenciaCompra})
Venta:     *$${venta} (${diferenciaVenta > 0 ? '+' : ''}${diferenciaVenta})*`;

    if (change) this.botService.sendMessage({ to: cels.joa, message: text });

    if (error)
      this.botService.sendMessage({
        to: cels.joa,
        message: `*ERROR!!!!!${fecha.toLocaleTimeString()}*\nCompra: ${compra}\nVenta: ${venta}`,
      });
  }
}
