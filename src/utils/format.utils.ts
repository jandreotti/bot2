export class Format {
  static roundNum(num: number, length: number): number {
    var number = Math.round(num * Math.pow(10, length)) / Math.pow(10, length);
    return number;
  }
}
