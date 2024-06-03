export class DolarState {

  fecha?: Date;
  compra?: number;
  venta?: number;

  fechaLastChange?: Date; // fecha del ultimo cambio
  compraLastChange?: number; // valor de la compra del ultimo cambio
  ventaLastChange?: number; // valor de la venta del ultimo cambio

  change?: boolean; //  si esto es true, el dolar ha cambiado y no es el primer checkeo. esta es la variable que va a determinar si se envia el mensaje o no
  // firstCheck?: boolean; // si esto es true, el ultimo checkeo ha sido el primero.
  error?: string;
  checkedOnce: boolean; // Esto indica si ha sido chequeado al menos una vez. inicia la aplicacion en false y luego se setea en true tras la primera ejecucion del cron
}
