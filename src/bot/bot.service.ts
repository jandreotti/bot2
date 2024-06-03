import { Injectable, OnModuleInit } from '@nestjs/common';
import { SendMessageDto } from './dto/send-message.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

import makeWASocket, { AuthenticationCreds, ConnectionState, DisconnectReason, WAMessageStubType, fetchLatestBaileysVersion, isJidBroadcast, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

import { ExecException, exec, execSync } from 'child_process';
import { cels } from './data/cels';
import { DolarService } from 'src/crawler/dolar.service';

// import { spawnSync } from 'child_process';

@Injectable()
export class BotService implements OnModuleInit {

  private sock;

  constructor(
    //! Inyecto el EventEmitter2 para poder usarlo en toda la aplicacion
    private readonly eventEmitter: EventEmitter2,

    //! Inyecto el servicio de Dolar para poder contestar con el valor actual del dolar ante el mensaje /dolar
    private readonly dolarService: DolarService
  ) { }



  sendMessage(sendMessageDto: SendMessageDto) {

    const { to, message } = sendMessageDto;

    this.sock.sendMessage(to, { text: message });

  }


  //! Implements the OnModuleInit interface, which has an onModuleInit method that will be called when the module is initialized
  onModuleInit() {
    console.log("INICIANDO Configuracion del Bot");

    //! Metodo que se encarga de ejecutar la conexion a whatsapp
    this.connectToWhatsApp();

    console.log("Configuracion del Bot FINALIZADA");
  }


  //! Metodo que se encarga de ejecutar la conexion a whatsapp
  private async connectToWhatsApp() {

    // utility function to help save the auth state in a single folder
    // this function serves as a good guide to help write auth & key states for SQL/no-SQL databases, which I would recommend in any production grade system
    //! mongo version -> start here -> https://www.npmjs.com/package/@iamrony777/baileys
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');



    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    this.sock = makeWASocket({
      // can provide additional config here
      // printQRInTerminal: true,

      // provide the auth state
      auth: state,

      // version: [2, 2413, 1], // the version of the WhatsApp Web client to use
      version,

      // browser: ['chrome', 'firefox', 'safari'],

      // ignore all broadcast messages -- to receive the same
      // comment the line below out
      // shouldIgnoreJid: jid => isJidBroadcast(jid),
      // shouldIgnoreJid: jid => isJidBroadcast(jid),



    });



    // this will be called as soon as the credentials are updated
    this.sock.ev.on('creds.update', async (arg: Partial<AuthenticationCreds>) => {
      console.log("\n\n\n********************");
      console.log("EVENTO: creds.update ");

      await saveCreds();
    });


    this.sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      console.log("\n\n\n********************");
      console.log("EVENTO: connection.update ");
      // console.log({ update });
      // console.log(`QR: ${update.qr}`);

      console.log({ update });


      const { connection, lastDisconnect, qr, isOnline } = update;

      if (qr) {
        //! EVENTO -> connection.qr
        this.eventEmitter.emit('connection.qr', qr);

      } else if (connection === 'close') {
        //! EVENTO -> connection.close
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
        // reconnect if not logged out
        if (shouldReconnect) {
          console.log('reconnecting...!!!!!!!!!');
          this.connectToWhatsApp();
        }

      } else if (connection === 'open') {
        //! EVENTO -> connection.open
        console.log('opened connection');
      } else if (isOnline) {
        //! EVENTO -> connection.online
        console.log('online');

        const hostname = execSync('hostname').toString();
        await this.sock.sendMessage("5493515925801@s.whatsapp.net", { text: `*Bot online en hostname:* ${hostname} \n${JSON.stringify(update, null, 2)}` });
      }


    });



    this.sock.ev.on('messages.upsert', async (m) => {
      console.log("\n\n\n********************");
      console.log("EVENTO: messages.upsert ");

      // Chequeo quien manda el mensaje. Si el mensaje lo mando yo, no hago nada
      if (m.messages[0].key.fromMe) return;

      // chequeo si es creacion de un grupo retorno
      if (m.messages[0].messageStubType === WAMessageStubType.GROUP_CREATE) return;

      // Imprimo  el mensaje que llega para tener registro
      console.log(JSON.stringify(m, undefined, 2));

      //  respondo el mensaje a quien lo envio
      // await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: "Mensaje llegado al bot:" });
      // console.log("numero:", m.messages[0].key.remoteJid);

      // enviar mensaje al numero 5493515925801@s.whatsapp.net
      // await this.sock.sendMessage('5493515925801@s.whatsapp.net', { text: 'Hola 2! Soy un bot, en que puedo ayudarte?' });

      // enviar mensaje al grupo Prueba -> 120363304303553469@g.us
      // await this.sock.sendMessage('120363304303553469@g.us', { text: 'Hola 3! Soy un bot, en que puedo ayudarte?' });



      // Obtener el mensaje que llega de wsp para procesar
      const mensaje = m.messages[0].message?.conversation || m.messages[0].message?.extendedTextMessage?.text;

      // Si no hay mensaje retorno
      if (!mensaje) return;

      // reenvio el mensaje que llega al remitente
      await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: `*Mensaje llegado al bot:* ${mensaje}` });


      //-x--------------------------------------------------------------------------------------------------------------------------
      if (mensaje?.startsWith('/x')) {
        // Si el mensaje empieza con /x ejecuto el comando en bash

        // Chequeo de seguridad. Si no soy yo retorno
        if (m.messages[0].key.remoteJid != "5493515925801@s.whatsapp.net") {
          await this.sock.sendMessage(
            m.messages[0].key.remoteJid!,
            {
              text: "*_ACCESO DENEGADO: Vos no podes mandarte cagadas GIL!_*"
            });

          return;
        }


        // Obtengo el comando a ejecutar
        const comando = mensaje.replace('/x', '').trim();

        // const comando2 = spawnSync(comando.split(" ")[0], [], { encoding: 'utf8', argv0: comando.split(' ').slice(1).join(' ') });


        console.log("EJECUTANDO...", comando, "tiempo inicio: ", new Date().toLocaleTimeString());

        // OPCION 1 -> ejecutar comando y obtener salida ASINCRONICO
        exec(
          comando,
          async function (error: ExecException, stdout, stderr) {
            console.log("EJECUTADO!!!", { error, stdout, stderr }, "tiempo fin: ", new Date().toLocaleTimeString());

            let salida = stdout ? `*SALIDA:* \n${stdout}\n\n` : ``;
            salida += error ? `*ERROR:* \n${error}\n\n` : ``;
            salida += stderr ? `*STDERR:* \n${stderr}` : ``;

            await this.sock.sendMessage(
              m.messages[0].key.remoteJid!,
              {
                text: salida
              });

          });

        // OPCION 2 -> ejecutar comando y obtener salida SINCRONICO
        // let res = "";
        // try {
        //   res = execSync(comando).toString();
        // }
        // catch (ex) {
        //   res = ex.toString();
        // }
        // console.log({ res });


        console.log("EJECUTADO DESPUES!!!", "tiempo fin: ", new Date().toLocaleTimeString());

        //-to--------------------------------------------------------------------------------------------------------------------------
      } else if (mensaje?.startsWith('/to')) {
        // Mensaje anonimo a alguien
        let [comando, destinatario, ...rest] = mensaje.split(' ');
        const mensajeDestino = rest.join(' ');

        if (cels[destinatario]) {
          destinatario = cels[destinatario];
        } else {
          destinatario += "@s.whatsapp.net";
        }

        await this.sock.sendMessage(
          destinatario,
          {
            text: `*Mensaje ANONIMO para ti:* \n${mensajeDestino}`
          });


        //-karma--------------------------------------------------------------------------------------------------------------------------
      } if (mensaje === '/karma') {
        const listasDePuteadas = [
          "Pollo puto",
          "Pollo trolo",
          "Pollo gil",
          "Pollo cagon",
          "Pollo sos un tira goma",
          "Pollo sos un pelotudo",
          "Pollo sos un inutil",
          "Agarrame los huevos pollo",
          "Panchito puchero"
        ];
        const puteadaAleatoria = listasDePuteadas[Math.floor(Math.random() * listasDePuteadas.length)];
        await this.sock.sendMessage(cels.ale,
          {
            text: `*${puteadaAleatoria}*`
          });


        //-dolar--------------------------------------------------------------------------------------------------------------------------
      } else if (mensaje === "/dolar") {
        const { fecha, compra, venta, checkedOnce } = this.dolarService.getEstadoDolar();

        let text;

        if (checkedOnce) {
          text = `*DOLAR:* \n${fecha.toLocaleTimeString()}\nCompra: ${compra}\nVenta: ${venta}`;
        } else {
          text = `*DOLAR:* \nNo se ha chequeado el dolar aun.`;
        }


        await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text });

        return;





      }
      //-jaula--------------------------------------------------------------------------------------------------------------------------
      else if (mensaje.startsWith("/jaula")) {
        await this.sock.sendMessage(m.messages[0].key.remoteJid!, { message: "Como te gusta el puterio ehh???   Ya lo vamos a implementar :)" });

        return;
      }

      //-help--------------------------------------------------------------------------------------------------------------------------
      else if (mensaje === "/help") {
        await this.sock.sendMessage(m.messages[0].key.remoteJid!,
          {
            text: `*COMANDOS:*

* /help -> ayuda

* /x -> ejecutar comando en bash (REQUIERE PERMISOS)

* /to TELEFONO_DESTINO MENSAJE-> mensaje anonimo a alguien. 
El TELEFONO_DESTINO debe estar en formato internacional sin el +
Aliases: ale, charly, rober, pumba, joa
ej: /to 5493515925801 Sos muy groso
ej: /to joa Sos muy groso


* /karma -> putea al pollo

* /dolar -> devuelve el valor del ultimo chequeo del dolar en cordoba 

* /jaula MENSAJE -> mensaje al grupo jaula de las locas (TODAVIA NO IMPLEMENTADO)

        ` }
        );
      }





    });
  }



}

