import { Module } from '@nestjs/common';
import { DolarService } from './dolar.service';


@Module({
  providers: [DolarService],
  exports: [DolarService]
})
export class CrawlerModule { }
