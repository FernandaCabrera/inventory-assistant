// Texts of the pages written for one Google search each. Their addresses are in src/pages.js.
//
// How to edit them:
//   - seoTitle and seoDescription are what Google shows: the blue title and the two lines under it.
//   - navLabel is the name of the page in the links at the bottom of every page.
//   - In "body", a text between quotes is a paragraph, a list in [ ] is a list of points, and
//     { steps: [ ] } is a numbered list.
//   - {name} marks a value filled in from src/config.js (prices, limits, the numbers of the
//     formulas), so it is never written twice. The list of names is in src/LandingPage.jsx.
//   - Everything said here has to be true of the tool today. If the tool changes, change the text.

const TEXT = {
  // Cycle count report
  counts: {
    es: {
      navLabel: "Informe de conteo cíclico",
      seoTitle: "Informe de conteo cíclico desde el Excel de SAP · MiKardex",
      seoDescription:
        "Sube el reporte de conteos cíclicos de SAP y obtén las conclusiones ya escritas: exactitud, valor de las diferencias, ubicaciones fuera del ciclo y qué falta por contar. Se ve gratis.",
      eyebrow: "Conteo cíclico · para bodegas",
      h1: "Informe de conteo cíclico a partir del Excel de SAP",
      lead: "SAP te entrega la lista de conteos: ubicaciones, fechas y diferencias. Las conclusiones las tienes que armar tú. Sube ese Excel y MiKardex las escribe: qué tan exacta está la bodega, cuánto valen las diferencias, qué zonas fallan más y qué ubicaciones llevan demasiado tiempo sin contarse.",
      sections: [
        {
          h: "Qué responde el informe",
          body: [
            "Depende de lo que traiga tu archivo. Con una lista de ubicaciones y la fecha de su último conteo:",
            [
              "Cobertura: qué parte de la bodega se contó dentro del ciclo que tú eliges (30, 60, 90, 180 o 365 días).",
              "Cuánto hace que no se cuenta cada ubicación, de la más antigua a la más reciente, con un buscador para encontrar cualquiera.",
              "Qué ubicaciones están fuera del ciclo, en qué zonas están y cuáles no tienen ningún conteo.",
              "Ritmo necesario: cuántas ubicaciones por semana hay que contar para cumplir el ciclo, al lado del ritmo de las últimas 4 semanas.",
            ],
            "Con el detalle de cada línea contada, o con un reporte de ajustes:",
            [
              "Exactitud por línea y por ubicación.",
              "Valor de las diferencias: faltantes, sobrantes, diferencia neta y diferencia absoluta.",
              "Las zonas y los motivos que concentran las diferencias.",
              "Ubicaciones que se repiten, posibles cruces de lote y la demora entre el conteo y su registro en el sistema.",
            ],
          ],
        },
        {
          h: "Qué archivo sirve",
          body: [
            "Un Excel (.xlsx) o un CSV, tal como sale del sistema. No hay que ordenarlo ni limpiarlo antes. Sirven tres tipos de reporte:",
            [
              "Ubicaciones (o productos) con la fecha de su último conteo.",
              "El detalle de los conteos: una fila por línea contada, con la cantidad en sistema y la cantidad contada.",
              "Solo los ajustes: las líneas que tuvieron diferencia.",
            ],
            "Lo único obligatorio es la fecha de conteo y la ubicación (o el código del producto). Si además trae valores, lote, motivo del ajuste o quién contó, el informe dice más.",
            "Las columnas se reconocen en español y en inglés, incluidos los nombres habituales de SAP (Storage Bin, Last inventory, Material). Si alguna no se reconoce, la eliges a mano antes de ver el informe.",
            "El archivo se lee como viene de verdad: con filas de título sobre el encabezado, negativos escritos como 3-, fechas vacías de SAP (00.00.0000) y fechas en formato día.mes.año. Lee hasta {maxLines} líneas por archivo.",
          ],
        },
        {
          h: "Cómo funciona",
          body: [
            {
              steps: [
                "Descarga de SAP, o de tu sistema de bodega, el reporte de conteos en Excel.",
                "Súbelo aquí y confirma las columnas. Toma menos de un minuto.",
                "Lee las conclusiones, revisa los gráficos y, si quieres, descarga el informe en Excel.",
              ],
            },
          ],
        },
        {
          h: "Qué es un conteo cíclico y cómo se mide",
          body: [
            "En un conteo cíclico se cuenta una parte de la bodega cada día o cada semana, en lugar de detener la operación para un inventario general. El ciclo es el plazo en que cada ubicación debe contarse al menos una vez: por ejemplo, 90 días.",
            "Se mide con dos números. La cobertura dice qué parte de las ubicaciones se contó dentro del ciclo. La exactitud dice qué parte de lo contado coincidió con el sistema: las líneas sin diferencia, divididas por las líneas contadas.",
            "Una exactitud alta con una cobertura baja engaña: lo poco que se contó estaba bien, pero la mayor parte de la bodega no se ha revisado. Por eso el informe muestra las dos cuando el archivo lo permite.",
          ],
        },
        {
          h: "Tu reporte no sale de tu computador",
          body: [
            "El archivo se lee y se analiza por completo en tu navegador. Nada de su contenido, incluidos los nombres de quienes contaron, se envía a un servidor ni a la IA. Tampoco queda guardado: desaparece cuando cierras o recargas la página.",
            "Las conclusiones se escriben con reglas fijas, no con IA. El mismo archivo siempre da el mismo informe.",
          ],
        },
        {
          h: "Cuánto cuesta",
          body: [
            "Ver el informe en pantalla es gratis y no pide registro.",
            "Descargarlo en Excel con tu propio archivo es parte del plan MiKardex ({price}). Con el ejemplo, la descarga está abierta para que veas cómo queda.",
          ],
        },
      ],
      faqTitle: "Preguntas frecuentes",
      faq: [
        {
          q: "¿Sirve si no uso SAP?",
          a: "Sí. Sirve cualquier sistema de bodega que exporte los conteos a Excel o CSV. Los nombres de las columnas de SAP se reconocen solos; con otro sistema puede que tengas que elegir alguna columna a mano.",
        },
        {
          q: "¿Qué reporte tengo que descargar?",
          a: "El que ya usas para revisar los conteos: la lista de ubicaciones con la fecha de su último inventario, o el detalle de los conteos con sus diferencias. Expórtalo a Excel sin cambiarlo.",
        },
        {
          q: "¿Sirve si cuento por producto y no por ubicación?",
          a: "Sí. Si el archivo trae el código del producto en lugar de la ubicación, el informe se arma por producto.",
        },
        {
          q: "Mi reporte solo trae los ajustes. ¿Puedo ver la exactitud?",
          a: "Sí, pero falta un dato: cuántas ubicaciones se contaron en el período. El informe te lo pide y con eso calcula la exactitud, en lugar de mostrar un número equivocado.",
        },
      ],
      bottom: { h: "Pruébalo con tu reporte o con el ejemplo", p: "El ejemplo usa datos inventados y muestra el informe completo.", link: "Subir mi reporte o ver el ejemplo" },
    },

    en: {
      navLabel: "Cycle count report",
      seoTitle: "Cycle count report from your SAP Excel export · MiKardex",
      seoDescription:
        "Upload the cycle count report you download from SAP and get the conclusions already written: accuracy, value of the differences, locations outside the cycle and what is left to count. Free on screen.",
      eyebrow: "Cycle counts · for warehouses",
      h1: "Cycle count report from your SAP Excel export",
      lead: "SAP gives you the list of counts: locations, dates and differences. The conclusions are left for you to build. Upload that Excel and MiKardex writes them: how accurate the warehouse is, what the differences are worth, which areas fail most and which locations have gone too long without a count.",
      sections: [
        {
          h: "What the report answers",
          body: [
            "It depends on what your file has. With a list of locations and the date of their last count:",
            [
              "Coverage: how much of the warehouse was counted within the cycle you choose (30, 60, 90, 180 or 365 days).",
              "How long since each location was counted, oldest first, with a search box to find any of them.",
              "Which locations are outside the cycle, which areas they are in and which have no count at all.",
              "Pace needed: how many locations per week have to be counted to keep the cycle, next to the pace of the last 4 weeks.",
            ],
            "With the detail of every line counted, or with an adjustment report:",
            [
              "Accuracy by line and by location.",
              "Value of the differences: shortages, surpluses, net difference and absolute difference.",
              "The areas and the reasons behind most of the differences.",
              "Locations that keep coming back, possible lot mix-ups and the delay between the count and its posting in the system.",
            ],
          ],
        },
        {
          h: "Which file works",
          body: [
            "An Excel file (.xlsx) or a CSV, as it comes out of the system. No need to sort it or clean it first. Three kinds of report work:",
            [
              "Locations (or products) with the date of their last count.",
              "The detail of the counts: one row per line counted, with the system quantity and the counted quantity.",
              "Adjustments only: the lines that had a difference.",
            ],
            "Only the count date and the location (or the product code) are required. If the file also has values, lot, adjustment reason or who counted, the report says more.",
            "Columns are recognized in English and Spanish, including the usual SAP names (Storage Bin, Last inventory, Material). If one is not recognized, you pick it by hand before seeing the report.",
            "The file is read as files really come: with title rows above the header, negatives written as 3-, empty SAP dates (00.00.0000) and dates as day.month.year. It reads up to {maxLines} lines per file.",
          ],
        },
        {
          h: "How it works",
          body: [
            {
              steps: [
                "Download the count report from SAP, or from your warehouse system, as an Excel file.",
                "Upload it here and confirm the columns. It takes under a minute.",
                "Read the conclusions, look at the charts and, if you want, download the report in Excel.",
              ],
            },
          ],
        },
        {
          h: "What a cycle count is and how it is measured",
          body: [
            "In a cycle count, part of the warehouse is counted every day or every week, instead of stopping the operation for a full inventory. The cycle is the time within which every location has to be counted at least once: 90 days, for example.",
            "It is measured with two numbers. Coverage says how many of the locations were counted within the cycle. Accuracy says how much of what was counted matched the system: the lines with no difference, divided by the lines counted.",
            "High accuracy with low coverage is misleading: the little that was counted was right, but most of the warehouse has not been checked. That is why the report shows both when the file allows it.",
          ],
        },
        {
          h: "Your report does not leave your computer",
          body: [
            "The file is read and analyzed entirely in your browser. Nothing in it, including the names of the people who counted, is sent to a server or to the AI. It is not saved either: it is gone when you close or reload the page.",
            "The conclusions are written by fixed rules, not by AI. The same file always gives the same report.",
          ],
        },
        {
          h: "What it costs",
          body: [
            "Seeing the report on screen is free and needs no sign-up.",
            "Downloading it in Excel with your own file is part of the MiKardex plan ({price}). With the example, the download is open so you can see how it looks.",
          ],
        },
      ],
      faqTitle: "Frequently asked questions",
      faq: [
        {
          q: "Does it work if I do not use SAP?",
          a: "Yes. Any warehouse system that exports the counts to Excel or CSV works. SAP column names are recognized on their own; with another system you may have to pick a column by hand.",
        },
        {
          q: "Which report do I download?",
          a: "The one you already use to review the counts: the list of locations with the date of their last inventory, or the detail of the counts with their differences. Export it to Excel without changing it.",
        },
        {
          q: "Does it work if I count by product and not by location?",
          a: "Yes. If the file has the product code instead of the location, the report is built by product.",
        },
        {
          q: "My report only has the adjustments. Can I see the accuracy?",
          a: "Yes, but one figure is missing: how many locations were counted in the period. The report asks you for it and uses it to work out the accuracy, instead of showing a wrong number.",
        },
      ],
      bottom: { h: "Try it with your report or with the example", p: "The example uses invented data and shows the full report.", link: "Upload my report or see the example" },
    },
  },

  // Inventory analysis from an Excel file
  analysis: {
    es: {
      navLabel: "Análisis de inventario en Excel",
      seoTitle: "Análisis de inventario en Excel: qué reponer y qué sobra · MiKardex",
      seoDescription:
        "Sube tu Excel de inventario y obtén el análisis hecho: qué se agota primero, cuánto pedir de cada producto, días de cobertura, clasificación ABC y stock sin movimiento. Prueba gratis.",
      eyebrow: "Análisis de inventario · para pymes",
      h1: "Análisis de inventario desde tu Excel, sin armar fórmulas",
      lead: "Ya tienes el Excel con tus productos y tu stock. Lo que toma tiempo es sacar las conclusiones: qué pedir esta semana, cuánto, y cuánto capital está detenido en productos que no se venden. Sube el archivo y MiKardex hace ese análisis en dos minutos.",
      sections: [
        {
          h: "Qué obtienes",
          body: [
            [
              "Qué se agota primero: los productos que se quedan sin stock antes, con sus días de cobertura.",
              "Lista de compra: qué pedir hoy y cuánto de cada producto, descontando lo que ya está pedido. Se descarga en Excel para enviarla al proveedor.",
              "Stock sin movimiento y exceso: los productos sin ventas y cuánto capital tienen detenido.",
              "Dashboard: estado del inventario, días de cobertura, distribución por bodega y capital detenido.",
              "Informe ejecutivo en PDF, listo para enviar, con clasificación ABC y recomendaciones.",
              "Un asistente con IA al que le preguntas con tus palabras: «¿qué pido esta semana?», «¿qué no se está vendiendo?».",
            ],
          ],
        },
        {
          h: "Qué necesita tu Excel",
          body: [
            "Tres columnas: producto, stock y unidades vendidas en un período, por ejemplo el último mes. Con eso ya hay análisis.",
            "Si además trae el costo unitario, se calculan el valor del inventario y el capital detenido. También se usan, cuando existen, la bodega, el punto de reorden, los días de reposición y las unidades ya pedidas.",
            "Sirve un archivo exportado de Excel, Bsale, Shopify u otro sistema, en .xlsx o .csv, con hasta {maxRows} productos. Las columnas se reconocen solas y tú las confirmas. Lee los números escritos a la chilena (1.234,5) y a la inglesa (1,234.5).",
          ],
        },
        {
          h: "Cómo se calcula",
          body: [
            "Son las mismas cuentas que harías en Excel, ya hechas:",
            [
              "Consumo diario: unidades vendidas en el período, divididas por los días del período.",
              "Días de cobertura: stock dividido por el consumo diario. Es para cuántos días alcanza lo que tienes.",
              "Punto de reorden, si tu archivo no lo trae: consumo diario × días de reposición × {factor}. Ese {pct}% extra es el margen de seguridad. Si el archivo tampoco trae los días de reposición, se usan {lead} días y puedes cambiarlos al subirlo.",
              "Cantidad a pedir: punto de reorden + la venta de los días que quieres cubrir ({coverDays} si no lo cambias) − stock − unidades ya pedidas.",
              "Exceso: stock sobre {excess} veces el punto de reorden. Sin movimiento: stock de un producto sin ventas en el período.",
              "Clasificación ABC por valor de consumo: clase A, los productos que suman el primer {abcA}% del consumo; clase B, hasta el {abcB}%; clase C, el resto y los productos sin ventas.",
            ],
            "Estas cuentas se hacen en tu navegador con reglas fijas. La IA se usa solo para responder tus preguntas.",
          ],
        },
        {
          h: "Tus datos",
          body: [
            "Tu archivo se lee en tu navegador y no se sube como archivo a ningún servidor. Los datos de tus productos se envían a la IA solo cuando haces una pregunta, para escribir la respuesta.",
          ],
        },
        {
          h: "Cuánto cuesta",
          body: [
            "La prueba es gratis y sin registro: {uploads}, {questions} preguntas al asistente y las primeras {rows} filas de la lista de compra.",
            "El plan MiKardex cuesta {price}. Abre la lista de compra completa con su descarga en Excel, el dashboard, el informe ejecutivo y más preguntas al asistente. Se paga con PayPal y cancelas cuando quieras.",
          ],
        },
      ],
      faqTitle: "Preguntas frecuentes",
      faq: [
        {
          q: "¿Tengo que cambiar mi Excel para subirlo?",
          a: "No. Se sube tal como lo tienes. Si hay filas de título sobre el encabezado o varias hojas, la herramienta elige la hoja del inventario y tú puedes cambiarla.",
        },
        {
          q: "¿Sirve si tengo varias bodegas?",
          a: "Sí. Si el archivo trae la bodega, el análisis se separa por bodega y el informe propone traspasos: stock que una bodega puede enviar a otra que está por comprar el mismo producto.",
        },
        {
          q: "¿Y si no tengo las ventas en el archivo?",
          a: "Sin unidades vendidas no se puede calcular para cuántos días alcanza el stock. Basta con las de un período, por ejemplo el último mes, y al subir el archivo dices de cuántos días es.",
        },
        {
          q: "¿Reemplaza a mi sistema de inventario?",
          a: "No. No lleva el registro de entradas y salidas. Analiza el archivo que ya tienes, cada vez que lo subes.",
        },
      ],
      bottom: { h: "Pruébalo con tu Excel o con los datos de ejemplo", p: "Los datos de ejemplo abren todo, incluido el dashboard y las descargas.", link: "Subir mi Excel o ver el ejemplo" },
    },
  },
};

export function landingText(id, lang) {
  return (TEXT[id] && TEXT[id][lang]) || null;
}
