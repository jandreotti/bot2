import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SendMessageDto } from './dto/send-message.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

import makeWASocket, {
  AnyMessageContent,
  AuthenticationCreds,
  ConnectionState,
  DisconnectReason,
  WAMessageStubType,
  downloadContentFromMessage,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

import { ExecException, exec, execSync } from 'child_process';

import { cels, grupos } from './data/cels';
import { DolarService } from 'src/crawler/dolar.service';

import {
  getAcceptedMediaTypes,
  getMediaType,
  isValidJid,
  saveMediaFile,
  sendMediaFile,
} from './helpers/bot.helper';

@Injectable()
export class BotService implements OnModuleInit {
  // - VARIABLES GENERALES --------------------------------------------------------------------------------------------------------------------------
  private sock: ReturnType<typeof makeWASocket>;

  //- CONSTRUCTOR --------------------------------------------------------------------------------------------------------------------------
  constructor(
    //! Inyecto el EventEmitter2 para poder usarlo en toda la aplicacion
    private readonly eventEmitter: EventEmitter2,

    //! Inyecto el servicio de Dolar para poder contestar con el valor actual del dolar ante el mensaje /dolar
    private readonly dolarService: DolarService,
  ) {}

  //- METODOS --------------------------------------------------------------------------------------------------------------------------
  //! Implements the OnModuleInit interface, which has an onModuleInit method that will be called when the module is initialized
  async onModuleInit() {
    console.log('INICIANDO Configuracion del Bot');

    //! Metodo que se encarga de ejecutar la conexion a whatsapp
    await this.connectToWhatsApp();

    console.log('Configuracion del Bot FINALIZADA');
  }

  sendMessage(sendMessageDto: SendMessageDto) {
    const { to, message } = sendMessageDto;
    this.sock.sendMessage(to, { text: message });
  }

  //! Metodo que se encarga de ejecutar la conexion a whatsapp
  private async connectToWhatsApp() {
    // utility function to help save the auth state in a single folder
    // this function serves as a good guide to help write auth & key states for SQL/no-SQL databases, which I would recommend in any production grade system
    //! mongo version -> start here -> https://www.npmjs.com/package/@iamrony777/baileys
    const { state, saveCreds } =
      await useMultiFileAuthState('auth_info_baileys');

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
    });

    //- EVENTOS DEL BOT --------------------------------------------------------------------------------------------------------------------------
    // this will be called as soon as the CREDENTIALS are updated
    this.sock.ev.on(
      'creds.update',
      async (arg: Partial<AuthenticationCreds>) => {
        console.log('\n\n\n********************');
        console.log('EVENTO: creds.update ');

        await saveCreds();
      },
    );

    // this will be called as soon as the CONNECTION state is updated
    this.sock.ev.on(
      'connection.update',
      async (update: Partial<ConnectionState>) => {
        console.log('\n\n\n********************');
        console.log('EVENTO: connection.update ');
        // console.log({ update });
        // console.log(`QR: ${update.qr}`);

        console.log({ update });

        const { connection, lastDisconnect, qr, isOnline } = update;

        if (qr) {
          //! EVENTO -> connection.qr
          this.eventEmitter.emit('connection.qr', qr);
        } else if (connection === 'close') {
          //! EVENTO -> connection.close
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut;
          console.log(
            'connection closed due to ',
            lastDisconnect?.error,
            ', reconnecting ',
            shouldReconnect,
          );
          // reconnect if not logged out
          if (shouldReconnect) {
            console.log('reconnecting...!!!!!!!!!');
            this.connectToWhatsApp();
          }
        } else if (connection === 'open') {
          //! EVENTO -> connection.open
          console.log('opened connection');

          //TODO: Eliminar esta linea
          const hostname = execSync('hostname').toString();
          await this.sock.sendMessage(cels.joa, {
            text: `*Bot online en hostname:* ${hostname} ${JSON.stringify(update, undefined, 2)} `,
          });
        } else if (isOnline) {
          //! EVENTO -> connection.online
          console.log('online');
        }
      },
    );

    // this will be called as soon as the messages are updated (new message, status update, etc)
    this.sock.ev.on(
      'messages.upsert',
      async (m: { messages: proto.IWebMessageInfo[]; type: string }) => {
        console.log('\n\n\n********************');
        console.log('EVENTO: messages.upsert ');

        //! VALIDACIONES -----------------------------

        const message: proto.IWebMessageInfo = m.messages[0];

        // Chequeo quien manda el mensaje. Si el mensaje lo mando yo, no hago nada
        if (message.key.fromMe) return;

        // chequeo si es creacion de un grupo retorno
        if (message.messageStubType === WAMessageStubType.GROUP_CREATE) return;

        // Chequeo si el mensaje tiene contenido. Si el mensaje no tiene message retorno. puede ser de este tipo: ->
        // {
        //   message: {
        //     key: {
        //       remoteJid: '5493515925801@s.whatsapp.net',
        //       fromMe: false,
        //       id: '3A8F3579F501EF9B3575',
        //       participant: undefined
        //     },
        //     messageTimestamp: 1717611296,
        //     pushName: '.',
        //     broadcast: false,
        //     messageStubType: 2,
        //     messageStubParameters: [ 'No matching sessions found for message' ]
        //   }
        // }
        if (!message.message) return;

        // Imprimo  el mensaje que llega para tener registro
        console.log('m', JSON.stringify(m, undefined, 2));

        //! VARIABLES -----------------------------

        //Tipos de mensajes:
        //MULTIMEDIA: imageMessage, videoMessage, audioMessage, documentMessage, stickerMessage, pttMessage, audioMessage, documentMessage, documentWithCaptionMessage
        //TEXTO: conversation, extendedTextMessage
        const messageType = getMediaType(message);

        const remitente = message.key.remoteJid!; // 549351123456@s.whatsapp.net
        const nroRemitente = message.key.remoteJid!.split('@')[0]; //549351123456

        const cantMensajes = m.messages.length;

        console.log({ messageType, remitente, nroRemitente, cantMensajes });

        // Obtener el mensaje que llega de wsp para procesar
        let mensaje: string;
        try {
          mensaje =
            message.message?.conversation.trim() ||
            message.message?.extendedTextMessage?.text.trim() ||
            message.message[
              'documentWithCaptionMessage'
            ]?.message?.documentMessage?.caption?.trim() ||
            message.message[messageType]?.caption?.trim();
        } catch (e) {
          console.log('ERROR: No se pudo obtener el mensaje', e);
        }

        console.log({ mensaje });

        // Si no hay mensaje retorno
        if (!mensaje) return;

        //! PROCESAMIENTO -----------------------------

        // respondo el mensaje a quien lo envio
        // await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: "Mensaje llegado al bot:" });
        // console.log("numero:", m.messages[0].key.remoteJid);

        // enviar mensaje al numero 5493515925801@s.whatsapp.net
        // await this.sock.sendMessage('5493515925801@s.whatsapp.net', { text: 'Hola 2! Soy un bot, en que puedo ayudarte?' });

        // enviar mensaje al grupo Prueba -> 120363304303553469@g.us
        // await this.sock.sendMessage('120363304303553469@g.us', { text: 'Hola 3! Soy un bot, en que puedo ayudarte?' });

        // reenvio el mensaje que llega al remitente
        // await this.sock.sendMessage(message.key.remoteJid!, { text: `*Mensaje llegado al bot:* ${mensaje}` });

        //* PROCESAMIENTO DE ARCHIVOS MULTIMEDIA
        // Si el mensaje tiene un archivo multimedia lo guardo y obtengo el filePath y el title
        const { filePath, title, gifPlayback } =
          getAcceptedMediaTypes().includes(messageType)
            ? await saveMediaFile(this.sock, message)
            : { filePath: '', title: '', gifPlayback: false };

        // TODO: remover este codido. EJEMPLO DE RECEPCION, GUARDADO y REENVIO DE ARCHIVOS MULTIMEDIA (Como llega se vuelve)
        // if (getAcceptedMediaTypes().includes(messageType)) { // aca determino si es un archivo multimedia
        //   //! RECIBIR IMAGEN
        //   const { filePath, title } = await saveMediaFile(this.sock, message);

        //   //! REENVIO IMAGEN
        //   await sendMediaFile(this.sock, message.key.remoteJid!, filePath, mensaje, title);
        // }

        // obtengo el comando a ejecutar
        const comando = mensaje.split(' ')[0];

        //-x--------------------------------------------------------------------------------------------------------------------------
        if (comando === '/x') {
          // Si el mensaje empieza con /x ejecuto el comando en BASH

          // Chequeo de seguridad. Si no soy yo retorno
          //if (m.messages[0].key.remoteJid != "5493515925801@s.whatsapp.net") {
          if (nroRemitente != '5493515925801') {
            await this.sock.sendMessage(message.key.remoteJid!, {
              text: '*_ACCESO DENEGADO: Vos no podes mandarte cagadas GIL!_*',
            });

            return;
          }

          // Obtengo el comando a ejecutar
          const comandoBash = mensaje.replace('/x', '').trim();

          // OPCION 1 -> ejecutar comando y obtener salida ASINCRONICO
          const self = this; //! Necesario para poder acceder a this.sock dentro de la funcion de exec. Si no se hace esto, this.sock no esta definido dentro de la funcion de exec -> https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
          exec(
            comandoBash,
            async function (error: ExecException, stdout, stderr) {
              console.log(
                'EJECUTADO!!!',
                { error, stdout, stderr },
                'tiempo fin: ',
                new Date().toLocaleTimeString(),
              );

              let salida = stdout ? `*SALIDA:* \n${stdout}\n\n` : ``;
              salida += error ? `*ERROR:* \n${error}\n\n` : ``;
              salida += stderr ? `*STDERR:* \n${stderr}` : ``;

              await self.sock.sendMessage(message.key.remoteJid!, {
                text: salida,
              });
            },
          );

          // OPCION 2 -> ejecutar comando y obtener salida SINCRONICO
          // let res = "";
          // try {
          //   res = execSync(comandoBash).toString();
          // }
          // catch (ex) {
          //   res = ex.toString();
          // }
          // console.log({ res });

          // OPCION 3 -> No testeado
          // const comando2 = spawnSync(comandoBash.split(" ")[0], [], { encoding: 'utf8', argv0: comandoBash.split(' ').slice(1).join(' ') });

          //-to--------------------------------------------------------------------------------------------------------------------------
        } else if (mensaje?.startsWith('/to')) {
          // Mensaje anonimo a alguien
          let [comando, destinatario, ...rest] = mensaje.split(' ');
          const mensajeDestino = rest.join(' ');

          if (cels[destinatario]) {
            destinatario = cels[destinatario];
          } else {
            destinatario += '@s.whatsapp.net';
          }

          const isValid = await isValidJid(this.sock, destinatario);
          if (!isValid) {
            await this.sock.sendMessage(message.key.remoteJid!, {
              text: `*ERROR:* \nEl destinatario no es válido.`,
            });
            return;
          }

          // Si el mensaje tiene un archivo multimedia lo reenvio
          if (getAcceptedMediaTypes().includes(messageType)) {
            sendMediaFile(
              this.sock,
              destinatario,
              filePath,
              mensajeDestino,
              title,
              gifPlayback,
            );
          } else {
            // Si no tiene archivo multimedia reenvio el mensaje de texto
            await this.sock.sendMessage(destinatario, {
              text: `*Mensaje ANONIMO para ti:* \n${mensajeDestino}`,
            });
          }

          //-karma--------------------------------------------------------------------------------------------------------------------------
        }
        if (mensaje === '/karma') {
          const listasDePuteadas = [
            'Pollo puto',
            'Pollo trolo',
            'Pollo gil',
            'Pollo cagon',
            'Pollo sos un tira goma',
            'Pollo sos un pelotudo',
            'Pollo sos un inutil',
            'Agarrame los huevos pollo',
            'Panchito puchero',
          ];
          const puteadaAleatoria =
            listasDePuteadas[
              Math.floor(Math.random() * listasDePuteadas.length)
            ];
          await this.sock.sendMessage(
            remitente === grupos.jaula ? grupos.jaula : cels.ale,
            {
              text: `*${puteadaAleatoria}*`,
            },
          );

          //-dolar--------------------------------------------------------------------------------------------------------------------------
        } else if (mensaje === '/dolar') {
          const { fecha, compra, venta, checkedOnce } =
            this.dolarService.getEstadoDolar();

          let text: string;

          if (checkedOnce) {
            text = `*DOLAR:* \n${fecha.toLocaleTimeString()}\nCompra: ${compra}\nVenta: ${venta}`;
          } else {
            text = `*DOLAR:* \nNo se ha chequeado el dolar aun.`;
          }

          await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text });

          return;
        }
        //-jaula--------------------------------------------------------------------------------------------------------------------------
        else if (mensaje.startsWith('/jaula')) {
          // Mensaje anonimo a alguien
          let [comando, ...rest] = mensaje.split(' ');
          const mensajeDestino = rest.join(' ');

          const destinatario = grupos.jaula;

          const isValid = await isValidJid(this.sock, destinatario);
          if (!isValid) {
            await this.sock.sendMessage(message.key.remoteJid!, {
              text: `*ERROR:* \nEl destinatario no es válido.`,
            });
            return;
          }

          // Si el mensaje tiene un archivo multimedia lo reenvio
          if (getAcceptedMediaTypes().includes(messageType)) {
            const mensajeFinal = `_Un pajarito me envio esto (:_ \n\n${mensajeDestino}`;
            sendMediaFile(
              this.sock,
              destinatario,
              filePath,
              mensajeFinal,
              title,
              gifPlayback,
            );
          } else {
            // Si no tiene archivo multimedia reenvio el mensaje de texto
            await this.sock.sendMessage(destinatario, {
              text: `_Me ha llegado el siguiente rumor (:_ \n\n${mensajeDestino}`,
            });
          }

          // await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: "Como te gusta el puterio ehh???   Ya lo vamos a implementar :)" });

          return;
        }

        //-botones--------------------------------------------------------------------------------------------------------------------------
        // else if (mensaje === "/botones") {
        //   const buttons = [
        //     { buttonId: 'id1', buttonText: { displayText: 'Button 1' }, type: 1 },
        //     { buttonId: 'id2', buttonText: { displayText: 'Button 2' }, type: 1 },
        //     { buttonId: 'id3', buttonText: { displayText: 'Button 3' }, type: 1 },
        //   ];

        //   const buttonMessage = {
        //     text: 'Hi it\'s button message',
        //     footer: 'Hello World',
        //     buttons: buttons,
        //     viewOnce: true,
        //     headerType: 1,
        //   };

        //   await this.sock.sendMessage(`${m.messages[0].key.remoteJid}`, buttonMessage);

        // }

        //-help--------------------------------------------------------------------------------------------------------------------------
        else if (mensaje === '/help') {
          await this.sock.sendMessage(m.messages[0].key.remoteJid!, {
            text: `*COMANDOS:*

* /help -> ayuda

* /x -> ejecutar comando en bash (REQUIERE PERMISOS)

* /to TELEFONO_DESTINO MENSAJE-> mensaje anonimo a alguien. 
El TELEFONO_DESTINO debe estar en formato internacional sin el +
Aliases: ale, charly, rober, pumba, joa, fer
ej: /to 5493515925801 Sos muy groso
ej: /to joa Sos muy groso


* /karma -> putea al pollo (Si esta en el grupo jaula putea en el grupo jaula, sino en privado al pollo)

* /dolar -> devuelve el valor del ultimo chequeo del dolar en cordoba.

* /jaula MENSAJE -> mensaje al grupo jaula de las locas.


NOTA: Se le puede agregar comando a las fotos/videos/gifs/documentos en la seccion inferior. ej: seleccionar una foto para mandar y en la parte inferior de comentarios poner /jaula para mandarla al grupo jaula
        `,
          });
        }
      },
    );
  }
}

//- v2 --------------------------------------------------------------------------------------------------------------------------

// import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// import { SendMessageDto } from './dto/send-message.dto';
// import { EventEmitter2 } from '@nestjs/event-emitter';

// import makeWASocket, { AnyMessageContent, AuthenticationCreds, ConnectionState, DisconnectReason, WAMessageStubType, downloadContentFromMessage, downloadMediaMessage, fetchLatestBaileysVersion, isJidBroadcast, proto, useMultiFileAuthState } from '@whiskeysockets/baileys';
// import { Boom } from '@hapi/boom';

// import { ChildProcess, ExecException, exec, execSync } from 'child_process';
// import { cels } from './data/cels';
// import { DolarService } from 'src/crawler/dolar.service';
// import { mkdir, writeFile } from 'fs/promises';
// // import fs from 'fs';
// import * as fs from 'node:fs/promises';
// import { lookup } from 'mime-types';

// // import { spawnSync } from 'child_process';

// @Injectable()
// export class BotService implements OnModuleInit {

//   private sock: ReturnType<typeof makeWASocket>;
//   // private sock;

//   constructor(
//     //! Inyecto el EventEmitter2 para poder usarlo en toda la aplicacion
//     private readonly eventEmitter: EventEmitter2,

//     //! Inyecto el servicio de Dolar para poder contestar con el valor actual del dolar ante el mensaje /dolar
//     private readonly dolarService: DolarService
//   ) { }

//   // sendMessage(sendMessageDto: SendMessageDto) {

//   //   const { to, message } = sendMessageDto;

//   //   this.sock.sendMessage(to, { text: message });

//   // }
//   //! Implements the OnModuleInit interface, which has an onModuleInit method that will be called when the module is initialized
//   onModuleInit() {
//     console.log("INICIANDO Configuracion del Bot");

//     //! Metodo que se encarga de ejecutar la conexion a whatsapp
//     this.connectToWhatsApp();

//     console.log("Configuracion del Bot FINALIZADA");
//   }

//   //! Metodo que se encarga de ejecutar la conexion a whatsapp
//   private async connectToWhatsApp() {
//     // utility function to help save the auth state in a single folder
//     // this function serves as a good guide to help write auth & key states for SQL/no-SQL databases, which I would recommend in any production grade system
//     //! mongo version -> start here -> https://www.npmjs.com/package/@iamrony777/baileys
//     const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

//     const { version, isLatest } = await fetchLatestBaileysVersion();
//     console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

//     this.sock = makeWASocket({

//       // can provide additional config here
//       // printQRInTerminal: true,

//       // provide the auth state
//       auth: state,

//       // version: [2, 2413, 1], // the version of the WhatsApp Web client to use
//       version,

//       // browser: ['chrome', 'firefox', 'safari'],

//       // ignore all broadcast messages -- to receive the same
//       // comment the line below out
//       // shouldIgnoreJid: jid => isJidBroadcast(jid),

//     });

//     // this will be called as soon as the credentials are updated
//     this.sock.ev.on('creds.update', async (arg: Partial<AuthenticationCreds>) => {
//       console.log("\n\n\n********************");
//       console.log("EVENTO: creds.update ");

//       await saveCreds();
//     });

//     // this will be called as soon as the connection state is updated
//     this.sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
//       console.log("\n\n\n********************");
//       console.log("EVENTO: connection.update ");
//       // console.log({ update });
//       // console.log(`QR: ${update.qr}`);

//       console.log({ update });

//       const { connection, lastDisconnect, qr, isOnline } = update;

//       if (qr) {
//         //! EVENTO -> connection.qr
//         this.eventEmitter.emit('connection.qr', qr);

//       } else if (connection === 'close') {
//         //! EVENTO -> connection.close
//         const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
//         console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
//         // reconnect if not logged out
//         if (shouldReconnect) {
//           console.log('reconnecting...!!!!!!!!!');
//           this.connectToWhatsApp();
//         }

//       } else if (connection === 'open') {
//         //! EVENTO -> connection.open
//         console.log('opened connection');
//       } else if (isOnline) {
//         //! EVENTO -> connection.online
//         console.log('online');

//         const hostname = execSync('hostname').toString();
//         await this.sock.sendMessage("5493515925801@s.whatsapp.net", { text: `*Bot online en hostname:* ${hostname} \n${JSON.stringify(update, null, 2)}` });
//       }

//     });

//     // this will be called as soon as the messages are updated (new message, status update, etc)
//     this.sock.ev.on('messages.upsert', async (m: { messages: proto.IWebMessageInfo[], type: string; }) => {

//       console.log("\n\n\n********************");
//       console.log("EVENTO: messages.upsert ");

//       //! VALIDACIONES -----------------------------
//       // Chequeo quien manda el mensaje. Si el mensaje lo mando yo, no hago nada
//       if (m.messages[0].key.fromMe) return;

//       // chequeo si es creacion de un grupo retorno
//       if (m.messages[0].messageStubType === WAMessageStubType.GROUP_CREATE) return;

//       // Imprimo  el mensaje que llega para tener registro
//       console.log("m", JSON.stringify(m, undefined, 2));

//       //! VARIABLES -----------------------------
//       // const messageType = Object.keys(m.messages[0].message)[0] !== "messageContextInfo"
//       //   ? Object.keys(m.messages[0].message)[0]
//       //   : Object.keys(m.messages[0].message)[1]; // imageMessage, videoMessage, audioMessage, documentMessage, stickerMessage, pttMessage, audioMessage, documentMessage, documentWithCaptionMessage

//       const messageType = this.getMediaType(m.messages[0]);
//       const remitente = m.messages[0].key.remoteJid!;
//       const nroRemitente = m.messages[0].key.remoteJid!.split('@')[0];

//       console.log({ messageType, remitente, nroRemitente });

//       // Obtener el mensaje que llega de wsp para procesar
//       let mensaje: string;
//       try {
//         mensaje =
//           m.messages[0].message?.conversation.trim()
//           || m.messages[0].message?.extendedTextMessage?.text.trim()
//           || m.messages[0].message["documentWithCaptionMessage"]?.message?.documentMessage?.caption?.trim()
//           || m.messages[0].message[messageType]?.caption?.trim();
//       } catch (e) {
//         console.log("ERROR: No se pudo obtener el mensaje", e);
//       }

//       console.log({ mensaje });

//       // Si no hay mensaje retorno
//       if (!mensaje) return;

//       const comando = mensaje.split(' ')[0];

//       //! PROCESAMIENTO -----------------------------

//       //  respondo el mensaje a quien lo envio
//       // await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: "Mensaje llegado al bot:" });
//       // console.log("numero:", m.messages[0].key.remoteJid);

//       // enviar mensaje al numero 5493515925801@s.whatsapp.net
//       // await this.sock.sendMessage('5493515925801@s.whatsapp.net', { text: 'Hola 2! Soy un bot, en que puedo ayudarte?' });

//       // enviar mensaje al grupo Prueba -> 120363304303553469@g.us
//       // await this.sock.sendMessage('120363304303553469@g.us', { text: 'Hola 3! Soy un bot, en que puedo ayudarte?' });

//       //* PROCESAMIENTO DE ARCHIVOS MULTIMEDIA
//       if (this.mediaTypes.includes(messageType)
//         // messageType === 'imageMessage'
//         // || messageType === 'videoMessage'
//         // || messageType === 'audioMessage'
//         // || messageType === 'documentMessage'
//         // || messageType === 'stickerMessage'
//         // || messageType === 'pttMessage'
//         // || messageType === 'audioMessage'
//         // || messageType === 'documentMessage'
//         // || messageType === "documentWithCaptionMessage"
//       ) {

//         // const mimeType = m.messages[0].message[messageType].mimetype
//         //   || m.messages[0].message["documentWithCaptionMessage"]?.message?.documentMessage?.mimetype;
//         // const parts = mimeType.split('/');
//         // const type = parts[0].trim();
//         // const lastPart = parts[parts.length - 1].split(';')[0].trim();
//         // console.log({ type, lastPart });

//         //! RECIBIR IMAGEN

//         const { filePath, title } = await this.saveMediaFile(m.messages[0]);

//         // try {
//         //   // download the message
//         //   // const buffer = await downloadContentFromMessage(
//         //   //   {
//         //   //     directPath: m.messages[0].message.imageMessage.directPath,
//         //   //     mediaKey: m.messages[0].message.imageMessage.mediaKey,
//         //   //     url: `https://mmg.whatsapp.net${m.messages[0].message.imageMessage.directPath}`,
//         //   //   },
//         //   //   // "ptv", //pre-recorded video (PTV) format
//         //   //   // "ptv",
//         //   //   "image",
//         //   //   {}
//         //   // );

//         //   const buffer = await downloadMediaMessage(
//         //     m.messages[0],
//         //     'buffer',
//         //     {},
//         //     {
//         //       logger: Logger.log.bind(Logger),
//         //       // pass this so that baileys can request a reupload of media
//         //       // that has been deleted
//         //       reuploadRequest: this.sock.updateMediaMessage,
//         //     }
//         //   );

//         //   // console.log({ buffer });

//         //   // save to file
//         //   // create folder if not exists
//         //   await mkdir(`./uploads/${type}`, { recursive: true });
//         //   //await writeFile('./uploads/type/my-download3.jpeg', buffer);

//         //   const nombreArchivo = `./uploads/${type}/${nroRemitente}-${m.messages[0].message[messageType].mediaKeyTimestamp}-wa${m.messages[0].key.id}.${mimeType.split('/')[1]}`;

//         //   await writeFile(nombreArchivo, buffer);
//         //   //await writeFile(`./uploads/${type}/${m.messages[0].message[messageType].mimetype.split('/')[0]}-${m.messages[0].message[messageType].mediaKeyTimestamp}-wa${m.messages[0].key.id}.${m.messages[0].message[messageType].mimetype.split('/')[1]}`, buffer);
//         //   //await writeFile(`./uploads/${m.messages[0].message.imageMessage.mimetype.split('/')[0]}-${m.messages[0].message.imageMessage.mediaKeyTimestamp}-wa${m.messages[0].key.id}.${m.messages[0].message.imageMessage.mimetype.split('/')[1]}`, buffer);

//         // }
//         // catch (error) {
//         //   console.log({ error });
//         // }

//         //! REENVIO IMAGEN

//         await this.sendMediaFile(m.messages[0].key.remoteJid!, filePath, mensaje, title);

//         // const image = await fs.readFile("./uploads/my-download3.jpeg");
//         // console.log({ image });

//         // const caption = m.messages[0].message.imageMessage.caption;
//         // console.log({ caption });
//         // await this.sock.sendMessage(
//         //   m.messages[0].key.remoteJid!,
//         //   {
//         //     image,
//         //     // video,
//         //     caption,
//         //     // gifPlayback: true
//         //   }
//         // );

//       }
//       //FIN

//       // reenvio el mensaje que llega al remitente
//       await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: `*Mensaje llegado al bot:* ${mensaje}` });

//       //-x--------------------------------------------------------------------------------------------------------------------------
//       if (comando === '/x') {
//         // Si el mensaje empieza con /x ejecuto el comando en bash

//         // Chequeo de seguridad. Si no soy yo retorno
//         //if (m.messages[0].key.remoteJid != "5493515925801@s.whatsapp.net") {
//         if (nroRemitente != "5493515925801") {
//           await this.sock.sendMessage(
//             m.messages[0].key.remoteJid!,
//             {
//               text: "*_ACCESO DENEGADO: Vos no podes mandarte cagadas GIL!_*"
//             });

//           return;
//         }

//         // Obtengo el comando a ejecutar
//         const comando = mensaje.replace('/x', '').trim();

//         // const comando2 = spawnSync(comando.split(" ")[0], [], { encoding: 'utf8', argv0: comando.split(' ').slice(1).join(' ') });

//         console.log("EJECUTANDO...", comando, "tiempo inicio: ", new Date().toLocaleTimeString());

//         // OPCION 1 -> ejecutar comando y obtener salida ASINCRONICO
//         exec(
//           comando,
//           async function (error: ExecException, stdout, stderr) {
//             console.log("EJECUTADO!!!", { error, stdout, stderr }, "tiempo fin: ", new Date().toLocaleTimeString());

//             let salida = stdout ? `*SALIDA:* \n${stdout}\n\n` : ``;
//             salida += error ? `*ERROR:* \n${error}\n\n` : ``;
//             salida += stderr ? `*STDERR:* \n${stderr}` : ``;

//             await this.sock.sendMessage(
//               m.messages[0].key.remoteJid!,
//               {
//                 text: salida
//               });

//           });

//         // OPCION 2 -> ejecutar comando y obtener salida SINCRONICO
//         // let res = "";
//         // try {
//         //   res = execSync(comando).toString();
//         // }
//         // catch (ex) {
//         //   res = ex.toString();
//         // }
//         // console.log({ res });

//         console.log("EJECUTADO DESPUES!!!", "tiempo fin: ", new Date().toLocaleTimeString());

//         //-to--------------------------------------------------------------------------------------------------------------------------
//       } else if (mensaje?.startsWith('/to')) {
//         // Mensaje anonimo a alguien
//         let [comando, destinatario, ...rest] = mensaje.split(' ');
//         const mensajeDestino = rest.join(' ');

//         if (cels[destinatario]) {
//           destinatario = cels[destinatario];
//         } else {
//           destinatario += "@s.whatsapp.net";
//         }

//         await this.sock.sendMessage(
//           destinatario,
//           {
//             text: `*Mensaje ANONIMO para ti:* \n${mensajeDestino}`
//           });

//         //-karma--------------------------------------------------------------------------------------------------------------------------
//       } if (mensaje === '/karma') {
//         const listasDePuteadas = [
//           "Pollo puto",
//           "Pollo trolo",
//           "Pollo gil",
//           "Pollo cagon",
//           "Pollo sos un tira goma",
//           "Pollo sos un pelotudo",
//           "Pollo sos un inutil",
//           "Agarrame los huevos pollo",
//           "Panchito puchero"
//         ];
//         const puteadaAleatoria = listasDePuteadas[Math.floor(Math.random() * listasDePuteadas.length)];
//         await this.sock.sendMessage(cels.ale,
//           {
//             text: `*${puteadaAleatoria}*`
//           });

//         //-dolar--------------------------------------------------------------------------------------------------------------------------
//       } else if (mensaje === "/dolar") {
//         const { fecha, compra, venta, checkedOnce } = this.dolarService.getEstadoDolar();

//         let text;

//         if (checkedOnce) {
//           text = `*DOLAR:* \n${fecha.toLocaleTimeString()}\nCompra: ${compra}\nVenta: ${venta}`;
//         } else {
//           text = `*DOLAR:* \nNo se ha chequeado el dolar aun.`;
//         }

//         await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text });

//         return;

//       }
//       //-jaula--------------------------------------------------------------------------------------------------------------------------
//       else if (mensaje.startsWith("/jaula")) {
//         await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: "Como te gusta el puterio ehh???   Ya lo vamos a implementar :)" });

//         return;
//       }

//       //-botones--------------------------------------------------------------------------------------------------------------------------
//       // else if (mensaje === "/botones") {
//       //   const buttons = [
//       //     { buttonId: 'id1', buttonText: { displayText: 'Button 1' }, type: 1 },
//       //     { buttonId: 'id2', buttonText: { displayText: 'Button 2' }, type: 1 },
//       //     { buttonId: 'id3', buttonText: { displayText: 'Button 3' }, type: 1 },
//       //   ];

//       //   const buttonMessage = {
//       //     text: 'Hi it\'s button message',
//       //     footer: 'Hello World',
//       //     buttons: buttons,
//       //     viewOnce: true,
//       //     headerType: 1,
//       //   };

//       //   await this.sock.sendMessage(`${m.messages[0].key.remoteJid}`, buttonMessage);

//       // }

//       //-help--------------------------------------------------------------------------------------------------------------------------
//       else if (mensaje === "/help") {
//         await this.sock.sendMessage(m.messages[0].key.remoteJid!,
//           {
//             text: `*COMANDOS:*

// * /help -> ayuda

// * /x -> ejecutar comando en bash (REQUIERE PERMISOS)

// * /to TELEFONO_DESTINO MENSAJE-> mensaje anonimo a alguien.
// El TELEFONO_DESTINO debe estar en formato internacional sin el +
// Aliases: ale, charly, rober, pumba, joa
// ej: /to 5493515925801 Sos muy groso
// ej: /to joa Sos muy groso

// * /karma -> putea al pollo

// * /dolar -> devuelve el valor del ultimo chequeo del dolar en cordoba

// * /jaula MENSAJE -> mensaje al grupo jaula de las locas (TODAVIA NO IMPLEMENTADO)

//         ` }
//         );
//       }

//     });
//   }

//   // private getMimeType(filePath: string) {
//   //   const mimeType = lookup(filePath);
//   //   return mimeType || 'application/octet-stream'; // Valor predeterminado si no se encuentra el MIME type
//   // }

//   // private get mediaTypes() {
//   //   return [
//   //     'imageMessage',
//   //     'videoMessage',
//   //     'audioMessage',
//   //     'documentMessage',
//   //     'stickerMessage',
//   //     'pttMessage',
//   //     'audioMessage',
//   //     'documentMessage',
//   //     'documentWithCaptionMessage'
//   //   ];
//   // }

//   // private getMediaType(message: proto.IWebMessageInfo): string {
//   //   // diferent to messageContextInfo
//   //   return Object.keys(message.message)[0] !== "messageContextInfo"
//   //     ? Object.keys(message.message)[0]
//   //     : Object.keys(message.message)[1];

//   // }

//   // /**
//   //  * Metodo que se encarga de guardar el archivo multimedia que llega por whatsapp en la carpeta uploads
//   //  *
//   //  * @param mensaje  mensaje que llega de whatsapp
//   //  * @returns devuelve el nombre del archivo guardado
//   //  */
//   // private async saveMediaFile(message: proto.IWebMessageInfo): Promise<{ filePath: string, title: string; }> {

//   //   // const messageType = Object.keys(message.message)[0] !== "messageContextInfo"
//   //   //   ? Object.keys(message.message)[0]
//   //   //   : Object.keys(message.message)[1]; // imageMessage, videoMessage, audioMessage, documentMessage, stickerMessage, pttMessage, audioMessage, documentMessage, documentWithCaptionMessage

//   //   const messageType = this.getMediaType(message);

//   //   // console.log({ messageType });

//   //   // const remitente = message.key.remoteJid!;
//   //   const nroRemitente = message.key.remoteJid!.split('@')[0];
//   //   // console.log({ remitente, nroRemitente });

//   //   const mimeType = message.message[messageType].mimetype
//   //     || message.message["documentWithCaptionMessage"]?.message?.documentMessage?.mimetype;
//   //   const parts = mimeType.split('/');
//   //   const type = parts[0].trim();
//   //   const lastPart = parts[parts.length - 1].split(';')[0].trim();
//   //   // console.log({ type, lastPart });

//   //   //! RECIBIR IMAGEN
//   //   try {
//   //     // download the message
//   //     // const buffer = await downloadContentFromMessage(
//   //     //   {
//   //     //     directPath: m.messages[0].message.imageMessage.directPath,
//   //     //     mediaKey: m.messages[0].message.imageMessage.mediaKey,
//   //     //     url: `https://mmg.whatsapp.net${m.messages[0].message.imageMessage.directPath}`,
//   //     //   },
//   //     //   // "ptv", //pre-recorded video (PTV) format
//   //     //   // "ptv",
//   //     //   "image",
//   //     //   {}
//   //     // );

//   //     const buffer = await downloadMediaMessage(
//   //       message,
//   //       'buffer',
//   //       {},
//   //       {
//   //         logger: Logger.log.bind(Logger),
//   //         // pass this so that baileys can request a reupload of media
//   //         // that has been deleted
//   //         reuploadRequest: this.sock.updateMediaMessage,
//   //       }
//   //     );

//   //     // console.log({ buffer });

//   //     // save to file
//   //     // create folder if not exists
//   //     await mkdir(`./uploads/${type}`, { recursive: true });
//   //     //await writeFile('./uploads/type/my-download3.jpeg', buffer);

//   //     console.log({ message });

//   //     const title = message.message[messageType].title
//   //       || message.message["documentWithCaptionMessage"]?.message?.documentMessage?.title
//   //       || '';

//   //     console.log({ title });

//   //     const extension = messageType === "imageMessage" || messageType === "stickerMessage" || messageType === "videoMessage"
//   //       ? mimeType.split('/')[1]
//   //       : message.message[messageType].title?.split('.').pop() || message.message["documentWithCaptionMessage"].message.documentMessage.title.split('.').pop() || '';

//   //     console.log({ extension });

//   //     const filePath = `./uploads/${type}/${nroRemitente}-${message.message[messageType].mediaKeyTimestamp}-wa${message.key.id}.${extension}`;

//   //     await writeFile(filePath, buffer);
//   //     //await writeFile(`./uploads/${type}/${m.messages[0].message[messageType].mimetype.split('/')[0]}-${m.messages[0].message[messageType].mediaKeyTimestamp}-wa${m.messages[0].key.id}.${m.messages[0].message[messageType].mimetype.split('/')[1]}`, buffer);
//   //     //await writeFile(`./uploads/${m.messages[0].message.imageMessage.mimetype.split('/')[0]}-${m.messages[0].message.imageMessage.mediaKeyTimestamp}-wa${m.messages[0].key.id}.${m.messages[0].message.imageMessage.mimetype.split('/')[1]}`, buffer);
//   //     return { filePath, title };
//   //   }
//   //   catch (error) {
//   //     console.log("ERROR GUARDANDO EL ARCHIVO", error);
//   //   }
//   //   return { filePath: '', title: '' };

//   // } // FIN SAVE

//   // private async sendMediaFile(to: string, file: string, caption: string, title: string) {
//   //   const archivo = await fs.readFile(file);

//   //   // image, video, audio, document ?
//   //   const parts = file.split('.');
//   //   const extension = parts[parts.length - 1];
//   //   const type =
//   //     ["mp4",
//   //       "avi",
//   //       "mov",
//   //       "mkv",
//   //       "flv",
//   //       "wmv",
//   //       "3gp",
//   //       "webm",
//   //       "mpg",
//   //       "mpeg",
//   //       "m4v",
//   //       "vob",
//   //       "m2ts",
//   //       "mts",
//   //     ].includes(extension) ? 'video'

//   //       : [
//   //         "jpg",
//   //         "jpeg",
//   //         "png",
//   //         "gif",
//   //         "bmp",
//   //         "webp",
//   //         "tiff",
//   //         "svg",
//   //         "eps",
//   //         "raw",
//   //         "cr2",
//   //         "nef"].includes(extension) ? 'image'

//   //         : ["mp3",
//   //           "wav",
//   //           "flac",
//   //           "aac",
//   //           "ogg",
//   //           "wma",

//   //         ].includes(extension) ? 'audio'

//   //           : extension === 'pdf' ? 'document'
//   //             : 'document';
//   //   // const mimetype = extension === 'mp4' ? 'video/mp4' : extension === 'jpg' ? 'image/jpeg' : extension === 'mp3' ? 'audio/mp3' : extension === 'pdf' ? 'application/pdf' : 'image/jpeg';
//   //   const mimetype = this.getMimeType(file);

//   //   const messageConfig: AnyMessageContent = {
//   //     // messageConfig[type] = archivo;
//   //     // messageConfig.image = archivo; or messageConfig.video = archivo; or messageConfig.audio = archivo; or messageConfig.document = archivo;
//   //     document: undefined,
//   //     // [type] : archivo,
//   //     // [type]: archivo,
//   //     mimetype,
//   //     caption,
//   //     // gifPlayback: true

//   //   };

//   //   delete messageConfig.document; // borro el document por las dudas

//   //   if (title !== '') messageConfig.fileName = title; // si title no es vacio lo agrego al mensaje (es el titulo del archivo)

//   //   messageConfig[type] = archivo; // agrego el archivo al mensaje (image, video, audio, document): archivo

//   //   console.log({ messageConfig });

//   //   await this.sock.sendMessage(
//   //     to,
//   //     messageConfig
//   //   );

//   // }

// }

//- v1 --------------------------------------------------------------------------------------------------------------------------

/*
@Injectable()
export class BotService implements OnModuleInit {

  private sock: ReturnType<typeof makeWASocket>;
  // private sock;

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



    //le pongo el tipo a m
    this.sock.ev.on('messages.upsert', async (m: { messages: proto.IWebMessageInfo[], type: string; }) => {
      console.log("\n\n\n********************");
      console.log("EVENTO: messages.upsert ");

      // Chequeo quien manda el mensaje. Si el mensaje lo mando yo, no hago nada
      if (m.messages[0].key.fromMe) return;

      // chequeo si es creacion de un grupo retorno
      if (m.messages[0].messageStubType === WAMessageStubType.GROUP_CREATE) return;

      // Imprimo  el mensaje que llega para tener registro
      console.log("m", JSON.stringify(m, undefined, 2));


      //  respondo el mensaje a quien lo envio
      // await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: "Mensaje llegado al bot:" });
      // console.log("numero:", m.messages[0].key.remoteJid);

      // enviar mensaje al numero 5493515925801@s.whatsapp.net
      // await this.sock.sendMessage('5493515925801@s.whatsapp.net', { text: 'Hola 2! Soy un bot, en que puedo ayudarte?' });

      // enviar mensaje al grupo Prueba -> 120363304303553469@g.us
      // await this.sock.sendMessage('120363304303553469@g.us', { text: 'Hola 3! Soy un bot, en que puedo ayudarte?' });



      //INICIO


      // const mes1 = m.messages[0];

      const messageType = Object.keys(m.messages[0].message)[0];
      console.log({ messageType });


      // console.log({ mes1: JSON.stringify(mes1, undefined, 2) });

      if (messageType === 'imageMessage') {

        const mimeType = m.messages[0].message.imageMessage.mimetype;
        console.log({ mimeType });

        const parts = mimeType.split('/');
        const lastPart = parts[parts.length - 1].split(';')[0].trim();
        console.log({ lastPart });

        //! RECIBIR IMAGEN
        try {
          // download the message
          const buffer = await downloadContentFromMessage(
            {
              directPath: m.messages[0].message.imageMessage.directPath,
              mediaKey: m.messages[0].message.imageMessage.mediaKey,
              url: `https://mmg.whatsapp.net${m.messages[0].message.imageMessage.directPath}`,
            },
            // "ptv", //pre-recorded video (PTV) format
            // "ptv",
            "image",
            {}
          );


          // const buffer = await downloadMediaMessage(
          //   m.messages[0],
          //   'buffer',
          //   {
          //   },
          //   {
          //     logger: Logger.log.bind(Logger),
          //     // pass this so that baileys can request a reupload of media
          //     // that has been deleted
          //     reuploadRequest: this.sock.updateMediaMessage,
          //   }
          // );

          // console.log({ buffer });

          // save to file
          // create folder if not exists
          await mkdir('./uploads', { recursive: true });
          await writeFile('./uploads/my-download3.jpeg', buffer);

        }
        catch (error) {
          console.log({ error });
        }




        //! REENVIO IMAGEN
        const image = await fs.readFile("./uploads/my-download3.jpeg");
        console.log({ image });

        const caption = m.messages[0].message.imageMessage.caption;
        console.log({ caption });
        await this.sock.sendMessage(
          m.messages[0].key.remoteJid!,
          {
            image,
            // video,
            caption,
            // gifPlayback: true
          }
        );

      }
      //FIN



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
        await this.sock.sendMessage(m.messages[0].key.remoteJid!, { text: "Como te gusta el puterio ehh???   Ya lo vamos a implementar :)" });

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
*/
