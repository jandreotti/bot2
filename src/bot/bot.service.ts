import { Injectable, OnModuleInit } from '@nestjs/common';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

import makeWASocket, { AuthenticationCreds, ConnectionState, DisconnectReason, WAMessageStubType, fetchLatestBaileysVersion, isJidBroadcast, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

import { ExecException, exec, execSync } from 'child_process';

// import { spawnSync } from 'child_process';

@Injectable()
export class BotService implements OnModuleInit {


  constructor(
    //! Inyecto el EventEmitter2 para poder usarlo en toda la aplicacion
    private eventEmitter: EventEmitter2
  ) { }

  //! implements the OnModuleInit interface, which has an onModuleInit method that will be called when the module is initialized
  onModuleInit() {
    console.log("INICIANDO Configuracion del Bot");

    //! Metodo que se encarga de ejecutar la conexion a whatsapp
    this.connectToWhatsApp();

    console.log("Configuracion del Bot FINALIZADA");
  }






  //! Metodo que se encarga de ejecutar la conexion a whatsapp
  async connectToWhatsApp() {

    // utility function to help save the auth state in a single folder
    // this function serves as a good guide to help write auth & key states for SQL/no-SQL databases, which I would recommend in any production grade system
    //! mongo version -> start here -> https://www.npmjs.com/package/@iamrony777/baileys
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');



    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
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
    sock.ev.on('creds.update', async (arg: Partial<AuthenticationCreds>) => {
      console.log("\n\n\n********************");
      console.log("EVENTO: creds.update ");

      await saveCreds();
    });


    sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      console.log("\n\n\n********************");
      console.log("EVENTO: connection.update ");
      // console.log({ update });
      // console.log(`QR: ${update.qr}`);



      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        //! EVENTO -> connection.qr
        this.eventEmitter.emit('connection.qr', qr);

      } else if (connection === 'close') {
        //! EVENTO -> connection.close
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
        // reconnect if not logged out
        if (shouldReconnect) {
          this.connectToWhatsApp();
        }

      } else if (connection === 'open') {
        //! EVENTO -> connection.open
        console.log('opened connection');
      }


    });



    sock.ev.on('messages.upsert', async (m) => {
      console.log("\n\n\n********************");
      console.log("EVENTO: messages.upsert ");
      console.log(JSON.stringify(m, undefined, 2));

      // console.log('replying to', m.messages[0].key.remoteJid);
      // await sock.sendMessage(m.messages[0].key.remoteJid!, { text: 'Hello there!' });

      // Chequeo quien manda el mensaje. Si el mensaje lo mando yo, no hago nada
      if (m.messages[0].key.fromMe) return;

      // chequeo si es creacion de un grupo retorno
      if (m.messages[0].messageStubType === WAMessageStubType.GROUP_CREATE) return;


      // Si el mensaje lo otro, respondo
      await sock.sendMessage(m.messages[0].key.remoteJid!, { text: 'Hola 2! Soy un bot, en que puedo ayudarte?' });
      // console.log("numero:", m.messages[0].key.remoteJid);

      // enviar mensaje al numero 5493515925801@s.whatsapp.net
      // await sock.sendMessage('5493515925801@s.whatsapp.net', { text: 'Hola 2! Soy un bot, en que puedo ayudarte?' });

      // enviar mensaje al grupo Prueba -> 120363304303553469@g.us
      // await sock.sendMessage('120363304303553469@g.us', { text: 'Hola 3! Soy un bot, en que puedo ayudarte?' });



      // Obtener el mensaje que llega de wsp para procesar
      const mensaje = m.messages[0].message?.conversation || m.messages[0].message?.extendedTextMessage?.text;


      // Si el mensaje empieza con /x ejecuto el comando
      if (mensaje?.startsWith('/x')) {

        // Chequeo de seguridad. Si no soy yo retorno
        if (m.messages[0].key.remoteJid != "5493515925801@s.whatsapp.net") {
          await sock.sendMessage(
            m.messages[0].key.remoteJid!,
            {
              text: "Vos no podes mandarte cagadas gil!"
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

            await sock.sendMessage(
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



      }


    });
  }



}
