import { Injectable, Logger } from '@nestjs/common';
import { DolarState } from './entities/dolar-state.entity';
import { Format } from 'src/utils/format.utils';


@Injectable()
export class DolarService {

  private readonly logger = new Logger(DolarService.name);

  private estadoDolar: DolarState = {
    checkedOnce: false,

    //TODO: Esto es testing:
    // checkedOnce: true,
    // fecha: new Date(),
    // compra: 3000,
    // venta: 3000,
  };


  constructor(
  ) { }


  async checkearDolarFetch(): Promise<DolarState> {
    try {
      const resp = await fetch("https://www.infodolar.com/cotizacion-dolar-provincia-cordoba.aspx");
      const html = await resp.text();
      // Obtengo compra y venta
      //  let compraS = html.split("Promedio")[2].split("colCompraVenta")[1].split("data-order=\"$ ")[1].split("\"")[0]; //Oficial
      //  let ventaS = html.split("Promedio")[2].split("colCompraVenta")[2].split("data-order=\"$ ")[1].split("\"")[0];  //Oficial
      let compraS = html.split("BluePromedio")[1].split("colCompraVenta")[1].split("data-order=\"$ ")[1].split("\"")[0];   //Blue
      let ventaS = html.split("BluePromedio")[1].split("colCompraVenta")[2].split("data-order=\"$ ")[1].split("\"")[0];    // Blue
      // Reemplazo de caracteres
      compraS = compraS.replace(".", "").replace(",", ".");
      ventaS = ventaS.replace(".", "").replace(",", ".");
      // Redondeo a 2 caracteres
      const compra = Format.roundNum(parseFloat(compraS), 2);
      const venta = Format.roundNum(parseFloat(ventaS), 2);


      // Si compra/venta es undefined/NaN/0 lanzo error para que no se actualice
      if (
        compra === undefined || venta === undefined ||
        isNaN(compra) || isNaN(venta) ||
        compra === 0 || venta === 0
      ) {
        throw new Error("Error al obtener el valor del dolar");
      }



      // obtengo si hubo cambios o no. 
      //Si es el primer checkeo no hay cambios -> osea si checkedOnce es false no hay cambios porque nunca se ha ejecutado y es la primera vez
      const change = this.estadoDolar.checkedOnce && (this.estadoDolar.compra !== compra || this.estadoDolar.venta !== venta);

      // Si hubo cambios guardo el estado anterior
      if (change) {
        this.estadoDolar = {
          ...this.estadoDolar,
          fechaLastChange: this.estadoDolar.fecha,
          compraLastChange: this.estadoDolar.compra,
          ventaLastChange: this.estadoDolar.venta
        };
      }

      // Actualizo el estado del dolar
      this.estadoDolar = {
        ...this.estadoDolar,
        fecha: new Date(),
        compra,
        venta,
        change,
        checkedOnce: true,
        error: undefined
      };

      // this.logger.log(`Dolar: ${compra} - ${venta}`);
      // console.log({ compra, venta });

      // Devuelvo el estado del dolar
      return this.estadoDolar;

    } catch (error) {

      // Actualizo el estado del dolar -> Si hay algun error solamente actualizo la variable change a false
      this.estadoDolar = {
        ...this.estadoDolar,
        change: false,
        error: `FECHA: ${new Date().toLocaleTimeString()} - ERROR: ${error}`
      };

      return this.estadoDolar;
    }

  }

  // getEstadoDolar(): DolarState {
  //   return this.estadoDolar;
  // }

  getEstadoDolar = (): DolarState => this.estadoDolar;



}
