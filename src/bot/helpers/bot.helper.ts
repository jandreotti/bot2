import { Logger } from "@nestjs/common";
import makeWASocket, { AnyMessageContent, downloadMediaMessage, proto } from "@whiskeysockets/baileys";

import { mkdir, writeFile } from "fs/promises";
import * as fs from 'node:fs/promises';

import { lookup } from "mime-types";
import { SendMessageDto } from "../dto/send-message.dto";




/**
 * Metodo que se encarga de devolver una lista de string con los tipos de mensajes multimedia aceptados
 * 
 * @returns devuelve un array con los tipos de mensajes con multimedia aceptados
 */
export const getAcceptedMediaTypes = (): string[] => {
  return [
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage',
    'pttMessage',
    'audioMessage',
    'documentMessage',
    'documentWithCaptionMessage'
  ];
};


/**
 * Metodo que se encarga de devolver el MIME type de un archivo pasandole el path del archivo
 * 
 * @param filePath  ruta del archivo del cual se quiere obtener el MIME type
 * @returns devuelve el MIME type del archivo
 */
export const getMimeType = (filePath: string) => {
  const mimeType = lookup(filePath);
  return mimeType || 'application/octet-stream'; // Valor predeterminado si no se encuentra el MIME type
};


/**
 * Metodo que se encarga de devolver el tipo de mensaje multimedia que llega por whatsapp
 * 
 * @param message mensaje que llega de whatsapp
 * @returns devuelve el tipo de mensaje multimedia que llega (imageMessage, videoMessage, audioMessage, documentMessage, stickerMessage, pttMessage, audioMessage, documentMessage, documentWithCaptionMessage)
 */
export const getMediaType = (message: proto.IWebMessageInfo): string => {

  // diferent to messageContextInfo
  return Object.keys(message.message)[0] !== "messageContextInfo"
    ? Object.keys(message.message)[0]
    : Object.keys(message.message)[1];

};



export const isValidJid = async (sock: ReturnType<typeof makeWASocket>, jid: string): Promise<Boolean> => {
  try {

    if (jid.includes('@s.whatsapp.net')) {
      const result = await sock.onWhatsApp(jid);
      if (result && result.length > 0) {
        console.log(`${jid} es un JID válido.`);
        return true;
      } else {
        console.log(`${jid} no es un JID válido.`);
        return false;
      }

    }
    else if (jid.includes('@g.us')) {

      const metadata = await Promise.race([
        sock.groupMetadata(jid),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 400))
      ]);

      if (metadata) {
        console.log(`${jid} es un JID válido. (GRUPO)`);
        return true;
      } else {
        console.log(`${jid} no es un JID válido. (GRUPO)`);
        return false;
      }

    } else {
      return false;
    }

  } catch (e) {
    console.log(`${jid} no es un JID válido. (CATCH)`);
    return false;
  }

};



// export const sendMessage = (sock: ReturnType<typeof makeWASocket>, sendMessageDto: SendMessageDto) => {

//   const { to, message } = sendMessageDto;

//   sock.sendMessage(to, { text: message });

// };

/**
 * Metodo que se encarga de guardar el archivo multimedia que llega por whatsapp en la carpeta uploads 
 * 
 * @param sock  socket de whatsapp
 * @param mensaje  mensaje que llega de whatsapp
 * @returns Promise<{ filePath: string, title: string; gifPlayback: boolean; }> devuelve un objeto con la ruta del archivo guardado y el titulo del archivo guardado y si es un gif
 */
export const saveMediaFile = async (sock: ReturnType<typeof makeWASocket>, message: proto.IWebMessageInfo): Promise<{ filePath: string, title: string; gifPlayback: boolean; }> => {
  try {
    const messageType = getMediaType(message); // imageMessage, videoMessage, audioMessage, documentMessage, stickerMessage, pttMessage, audioMessage, documentMessage, documentWithCaptionMessage
    const nroRemitente = message.key.remoteJid!.split('@')[0];

    const mimeType = message.message[messageType].mimetype
      || message.message["documentWithCaptionMessage"]?.message?.documentMessage?.mimetype;

    const parts = mimeType.split('/'); // image/jpeg -> [image, jpeg]  video/mp4 -> [video, mp4] audio/mp3 -> [audio, mp3]  application/pdf -> [application, pdf]
    const type = parts[0].trim(); // image, video, audio, application

    //! RECIBIR IMAGEN
    // download the message
    // const buffer = await downloadContentFromMessage(
    //   {
    //     directPath: m.messages[0].message.imageMessage.directPath,
    //     mediaKey: m.messages[0].message.imageMessage.mediaKey,
    //     url: `https://mmg.whatsapp.net${m.messages[0].message.imageMessage.directPath}`,
    //   },
    //   // "ptv", //pre-recorded video (PTV) format
    //   // "ptv",
    //   "image",
    //   {}
    // );


    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger: Logger.log.bind(Logger),

        // pass this so that baileys can request a reupload of media that has been deleted
        reuploadRequest: sock.updateMediaMessage,
      }
    );


    // save to file
    // create folder if not exists
    await mkdir(`./uploads/${type}`, { recursive: true });

    // obtengo el titulo si es un archivo de tipo documentMessage o documentWithCaptionMessage  
    const title = message.message[messageType].title
      || message.message["documentWithCaptionMessage"]?.message?.documentMessage?.title
      || '';



    const extension = messageType === "imageMessage" || messageType === "stickerMessage" || messageType === "videoMessage"
      ? mimeType.split('/')[1]
      : message.message[messageType].title?.split('.').pop() || message.message["documentWithCaptionMessage"].message.documentMessage.title.split('.').pop() || '';


    // console.log({ extension });
    const filePath = `./uploads/${type}/${nroRemitente}-${message.message[messageType].mediaKeyTimestamp}-wa${message.key.id}.${extension}`;

    const gifPlayback = message.message[messageType].gifPlayback;

    await writeFile(filePath, buffer);
    //await writeFile(`./uploads/${type}/${m.messages[0].message[messageType].mimetype.split('/')[0]}-${m.messages[0].message[messageType].mediaKeyTimestamp}-wa${m.messages[0].key.id}.${m.messages[0].message[messageType].mimetype.split('/')[1]}`, buffer);
    //await writeFile(`./uploads/${m.messages[0].message.imageMessage.mimetype.split('/')[0]}-${m.messages[0].message.imageMessage.mediaKeyTimestamp}-wa${m.messages[0].key.id}.${m.messages[0].message.imageMessage.mimetype.split('/')[1]}`, buffer);
    return { filePath, title, gifPlayback };
  }
  catch (e) {
    console.log("ERROR GUARDANDO EL ARCHIVO", e);
  }
  return { filePath: '', title: '', gifPlayback: false };

};


/**
 * Metodo que se encarga de enviar un archivo multimedia a un numero de telefono de whatsapp
 * 
 * @param sock socket de whatsapp
 * @param to  numero de telefono al que se le quiere enviar el archivo multimedia. ej: 549351123456@s.whatsapp.net
 * @param filePath ruta del archivo que se quiere enviar
 * @param caption 
 * @param title 
 */
export const sendMediaFile = async (sock: ReturnType<typeof makeWASocket>, to: string, filePath: string, caption: string, title: string, gifPlayback: boolean = false) => {
  try {
    const archivo = await fs.readFile(filePath);


    const parts = filePath.split('.');
    const extension = parts[parts.length - 1];

    // image, video, audio, document ?
    const type =
      ["mp4",
        "avi",
        "mov",
        "mkv",
        "flv",
        "wmv",
        "3gp",
        "webm",
        "mpg",
        "mpeg",
        "m4v",
        "vob",
        "m2ts",
        "mts",
      ].includes(extension) ? 'video'

        : [
          "jpg",
          "jpeg",
          "png",
          "gif",
          "bmp",
          "webp",
          "tiff",
          "svg",
          "eps",
          "raw",
          "cr2",
          "nef"].includes(extension) ? 'image'

          : ["mp3",
            "wav",
            "flac",
            "aac",
            "ogg",
            "wma",

          ].includes(extension) ? 'audio'
            : extension === 'pdf' ? 'document'
              : 'document';


    // const mimetype = extension === 'mp4' ? 'video/mp4' : extension === 'jpg' ? 'image/jpeg' : extension === 'mp3' ? 'audio/mp3' : extension === 'pdf' ? 'application/pdf' : 'image/jpeg';
    const mimetype = getMimeType(filePath);

    const messageConfig: AnyMessageContent = {

      // messageConfig[type] = archivo;
      // messageConfig.image = archivo; or messageConfig.video = archivo; or messageConfig.audio = archivo; or messageConfig.document = archivo;
      // [type]: archivo,
      document: undefined,


      mimetype,
      caption,
      // gifPlayback: true
    };



    delete messageConfig.document; // borro el document por las dudas

    if (title !== '') messageConfig.fileName = title; // si title no es vacio lo agrego al mensaje (es el titulo del archivo)


    messageConfig[type] = archivo; // agrego el archivo al mensaje (image, video, audio, document): archivo



    await sock.sendMessage(to, { ...messageConfig, gifPlayback });
  }
  catch (e) {
    console.log("ERROR ENVIANDO EL ARCHIVO", e);
  }
};



