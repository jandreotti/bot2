// (async () => {
//   await checkearDolarFetch();
//   // await checkearDolarAxios();

//   // console.log(roundNum(1.23456789, 2));

//   console.log("Dolar checkeado");
// })();

// async function checkearDolarFetch() {
//   const resp = await fetch("https://www.infodolar.com/cotizacion-dolar-provincia-cordoba.aspx");
//   const html = await resp.text();
//   // Obtengo compra y venta
//   //  let compraS = html.split("Promedio")[2].split("colCompraVenta")[1].split("data-order=\"$ ")[1].split("\"")[0]; //Oficial
//   //  let ventaS = html.split("Promedio")[2].split("colCompraVenta")[2].split("data-order=\"$ ")[1].split("\"")[0];  //Oficial
//   let compraS = html.split("BluePromedio")[1].split("colCompraVenta")[1].split("data-order=\"$ ")[1].split("\"")[0];   //Blue
//   let ventaS = html.split("BluePromedio")[1].split("colCompraVenta")[2].split("data-order=\"$ ")[1].split("\"")[0];    // Blue
//   // Reemplazo de caracteres
//   compraS = compraS.replace(".", "").replace(",", ".");
//   ventaS = ventaS.replace(".", "").replace(",", ".");
//   // Redondeo a 2 caracteres
//   const compra = roundNum(parseFloat(compraS), 2);
//   const venta = roundNum(parseFloat(ventaS), 2);
//   console.log({ compra, venta });
// }

// async function checkearDolar() {
//   return fetch("https://www.infodolar.com/cotizacion-dolar-provincia-cordoba.aspx")
//     .then(resp => resp.text())
//     .then(html => {
//       // Obtengo compra y venta
//       let compra = html.split("BluePromedio")[1].split("colCompraVenta")[1].split("data-order=\"$ ")[1].split("\"")[0];
//       let venta = html.split("BluePromedio")[1].split("colCompraVenta")[2].split("data-order=\"$ ")[1].split("\"")[0];

//       // Reemplazo de caracteres
//       compra = compra.replace(".", "").replace(",", ".");
//       venta = venta.replace(".", "").replace(",", ".");

//       // Redondeo a 2 caracteres
//       compra = roundNum(parseFloat(compra), 2);
//       venta = roundNum(parseFloat(venta), 2);

//       console.log({ compra, venta });

//     });
// }

// function roundNum(num: number, length: number): number {
//   var number = Math.round(num * Math.pow(10, length)) / Math.pow(10, length);
//   return number;
// };
