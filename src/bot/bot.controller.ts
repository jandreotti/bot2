import { Controller, Get, Res } from '@nestjs/common';
import { BotService } from './bot.service';
import { OnEvent } from '@nestjs/event-emitter';
import { Response } from 'express';

//! NUEVA LIBRERA
import * as QRCode from 'qrcode';

//! Viejo del primer proyecto
// import { imageSync } from 'qr-image';

@Controller('bot')
export class BotController {
  private qrCode: string;

  constructor(private readonly botService: BotService) {}

  //! Metodo que se encarga de guardar el QR Code cuando se recibe el evento 'qrcode.created' por el EventEmitter
  @OnEvent('connection.qr')
  handleQrcodeCreatedEvent(qrCode: string) {
    this.qrCode = qrCode;
  }

  //! Metodo que se encarga de obtener el QR Code en imagen
  @Get('qrcode')
  async getQrCode(@Res() response: Response) {
    if (!this.qrCode) {
      return response.status(404).send('QR Code not found');
    }

    //! Forma nueva
    response.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(response, this.qrCode);

    //! Forma vieja del proyecto anterior de devolver el codigo qr
    // if (this.qrCode) {

    //   let html = '';
    //   let htmlCode = '';

    //   // var svg_string = qr.imageSync(this.qrCode, { type: 'svg' });
    //   var svg_string = imageSync(this.qrCode, { type: 'svg' });
    //   htmlCode = `
    //   		<div style="width:300px;height:300px">
    //   			${svg_string}
    //   		</div>
    //   	`;

    //   html = `
    //   	<html>
    //   		<head>
    //   			<title>QR</title>
    //   		</head>
    //   		<body>
    //   			<h1>(QR)</h1>
    //   			${htmlCode}
    //   			<label>QR: \n${this.qrCode}</label>
    //   			<br/><br/>
    //   		</body>

    //   	</html>
    //   `;
    //   response.status(200).send(html);
    // }
  }
}
