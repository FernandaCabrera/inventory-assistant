// Texts of the pages written for one Google search each. Their addresses are in src/pages.js.
//
// How to edit them:
//   - seoTitle and seoDescription are what Google shows: the blue title and the two lines under it.
//   - navLabel is the name of the page in the links at the bottom of every page.
//   - In "body", a text between quotes is a paragraph, a list in [ ] is a list of points, and
//     { steps: [ ] } is a numbered list. A guide can also carry { table: { head, rows } },
//     { formulas: [{ cell, what, formula }] } (Excel formulas to copy) and { see: [ ] } (links to
//     other pages, by their name in src/pages.js).
//   - "download" is a file the page offers (it lives in public/), with the text of its button.
//   - {name} marks a value filled in from src/config.js (prices, limits, the numbers of the
//     formulas, the contact email), so it is never written twice. The list of names is in
//     src/LandingPage.jsx.
//   - A page about a service has "cta" (the text of its button, which writes an email),
//     "mailSubject" (the subject of that email) and "note" (the line under the button).
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
            { see: ["reorder", "kardex"] },
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

  // Excel automation: a service done by hand, for any area of a business. It says only what
  // the service is: what is done, with what, and how to ask. No prices and no promised times.
  excel: {
    es: {
      navLabel: "Automatización de Excel",
      seoTitle: "Automatización de Excel a medida para tu negocio · MiKardex",
      seoDescription:
        "¿Tu Excel toma horas o dejó de funcionar? Lo automatizo, lo arreglo o creo uno desde cero, para cualquier área de tu negocio y no solo inventario. Con IA y fórmulas. Escríbeme.",
      eyebrow: "Servicio · Excel a medida",
      h1: "Automatización de Excel para tu negocio",
      lead: "Si tienes un Excel que te toma horas, o uno que dejó de funcionar, lo tomo tal como está y te ayudo a automatizarlo o a arreglarlo. Si todavía no existe, lo creo desde cero. Y no tiene que ser de inventario: puede ser de cualquier área de tu negocio.",
      cta: "Escribir por correo",
      mailSubject: "Automatización de Excel",
      note: "{email} · {name}, creadora de MiKardex",
      sections: [
        {
          h: "Qué puedo hacer con tu Excel",
          body: [
            [
              "Automatizarlo: tomo el Excel que ya tienes y hago que lo que hoy armas a mano se calcule solo.",
              "Arreglarlo: fórmulas que dan error, resultados que no cuadran o un archivo que ya nadie quiere tocar.",
              "Crearlo desde cero: si todavía no tienes el Excel, lo armo según lo que necesitas.",
            ],
          ],
        },
        {
          h: "No solo inventario",
          body: [
            "MiKardex partió por el inventario, pero este servicio es para cualquier área de tu negocio: ventas, compras, gastos, informes o lo que hoy lleves en una planilla.",
          ],
        },
        {
          h: "Cómo lo hago",
          body: [
            "Trabajo con inteligencia artificial y con fórmulas que aplico yo misma. El resultado es tu Excel funcionando.",
            "Soy {name}, creadora de MiKardex y especialista en control de inventario.",
          ],
        },
        {
          h: "Cómo empezar",
          body: [
            {
              steps: [
                "Escribe a {email} y cuéntame qué Excel tienes, o cuál necesitas, y qué quieres que haga.",
                "Te respondo y vemos por correo las preguntas que tengas.",
              ],
            },
          ],
        },
        {
          h: "Cuánto cuesta",
          body: ["Depende de lo que haya que hacer. Escribe a {email} con lo que necesitas y te respondo."],
        },
      ],
      faqTitle: "Preguntas frecuentes",
      faq: [
        { q: "¿Tiene que ser un Excel de inventario?", a: "No. Puede ser de cualquier área de tu negocio." },
        { q: "¿Y si todavía no tengo ningún Excel?", a: "Lo creo desde cero, según lo que necesites." },
        {
          q: "¿En qué se diferencia de la herramienta de MiKardex?",
          a: "La herramienta analiza tu inventario al momento: subes tu Excel y ves qué reponer y qué no se vende. Este servicio es un trabajo a medida sobre tu propio archivo, sea de inventario o no.",
        },
      ],
      bottom: { h: "Cuéntame qué necesitas", p: "Escribe a {email}. Puedes preguntar lo que quieras.", link: "Escribir por correo" },
    },

    en: {
      navLabel: "Excel automation",
      seoTitle: "Custom Excel automation for your business · MiKardex",
      seoDescription:
        "Does your Excel take hours or no longer work? I automate it, fix it or build one from scratch, for any area of your business and not only inventory. With AI and formulas. Write to me.",
      eyebrow: "Service · Excel built for you",
      h1: "Excel automation for your business",
      lead: "If you have an Excel file that takes you hours, or one that stopped working, I take it as it is and help you automate it or fix it. If it does not exist yet, I build it from scratch. And it does not have to be about inventory: it can be for any area of your business.",
      cta: "Write by email",
      mailSubject: "Excel automation",
      note: "{email} · {name}, creator of MiKardex",
      sections: [
        {
          h: "What I can do with your Excel",
          body: [
            [
              "Automate it: I take the Excel you already have and make what you put together by hand today work itself out.",
              "Fix it: formulas that give errors, results that do not add up or a file nobody wants to touch any more.",
              "Build it from scratch: if you do not have the Excel yet, I build it around what you need.",
            ],
          ],
        },
        {
          h: "Not only inventory",
          body: [
            "MiKardex started with inventory, but this service is for any area of your business: sales, purchasing, expenses, reports or whatever you keep in a spreadsheet today.",
          ],
        },
        {
          h: "How I do it",
          body: [
            "I work with artificial intelligence and with formulas I apply myself. The result is your Excel, working.",
            "I am {name}, creator of MiKardex and an inventory control specialist.",
          ],
        },
        {
          h: "How to start",
          body: [
            {
              steps: [
                "Write to {email} and tell me which Excel you have, or which one you need, and what you want it to do.",
                "I reply and we go over any questions you have by email.",
              ],
            },
          ],
        },
        {
          h: "What it costs",
          body: ["It depends on what has to be done. Write to {email} with what you need and I will reply."],
        },
      ],
      faqTitle: "Frequently asked questions",
      faq: [
        { q: "Does it have to be an inventory spreadsheet?", a: "No. It can be for any area of your business." },
        { q: "What if I do not have any Excel yet?", a: "I build it from scratch, around what you need." },
        {
          q: "How is it different from the MiKardex tool?",
          a: "The tool analyzes your inventory on the spot: you upload your Excel and see what to reorder and what is not selling. This service is custom work on your own file, whether it is about inventory or not.",
        },
      ],
      bottom: { h: "Tell me what you need", p: "Write to {email}. You can ask anything you want.", link: "Write by email" },
    },
  },

  // Guide: how to work out the reorder point by hand in Excel. The numbers of its example are
  // checked against the tool's own arithmetic in src/App.test.js: if a rule of the tool changes,
  // that test says which sentence here stopped being true.
  reorder: {
    es: {
      navLabel: "Punto de reorden en Excel",
      seoTitle: "Punto de reorden en Excel: fórmula y ejemplo paso a paso · MiKardex",
      seoDescription:
        "Cómo calcular el punto de reorden en Excel: la fórmula, un ejemplo con números, las fórmulas listas para copiar, cuánto stock de seguridad dejar y los errores más comunes.",
      eyebrow: "Guía · reposición de inventario",
      h1: "Cómo calcular el punto de reorden en Excel",
      lead: "El punto de reorden es el nivel de stock en el que hay que hacer un nuevo pedido para no quedarse sin producto antes de que llegue. Aquí están la fórmula, un ejemplo con números y las fórmulas de Excel listas para copiar.",
      sections: [
        {
          h: "La fórmula",
          body: [
            "Punto de reorden = consumo diario × días de reposición + stock de seguridad.",
            [
              "Consumo diario: cuántas unidades vendes o usas por día, en promedio.",
              "Días de reposición: cuánto se demora el proveedor desde que haces el pedido hasta que el producto está en tu bodega.",
              "Stock de seguridad: un margen por si vendes más de lo normal o el proveedor se atrasa.",
            ],
            "La idea es simple: mientras esperas el pedido, sigues vendiendo. El punto de reorden es lo que vas a vender durante esa espera, más un margen.",
          ],
        },
        {
          h: "Un ejemplo con números",
          body: [
            "Vendes toallas de papel. En los últimos 30 días vendiste 120 cajas y tu proveedor se demora 7 días en entregar.",
            {
              steps: [
                "Consumo diario: 120 ÷ 30 = 4 cajas por día.",
                "Venta durante la espera: 4 × 7 = 28 cajas.",
                "Stock de seguridad: la mitad de eso, 14 cajas.",
                "Punto de reorden: 28 + 14 = 42 cajas.",
              ],
            },
            "Cuando te queden 42 cajas, haces el pedido. Si esperas a que queden 20, lo más probable es que te quedes sin stock antes de que llegue.",
          ],
        },
        {
          h: "Cuánto stock de seguridad dejar",
          body: [
            "Hay dos formas comunes de calcularlo.",
            [
              "Un porcentaje de la venta durante la espera: es la más simple. Con un {pct}%, la fórmula queda consumo diario × días de reposición × {factor}. Es la que usa MiKardex cuando tu archivo no trae el punto de reorden.",
              "El peor caso menos el caso normal: (venta diaria máxima × días de reposición máximos) − (venta diaria promedio × días de reposición promedio). Sirve si llevas registro de tus mejores días de venta y de los atrasos del proveedor.",
            ],
            "Con el ejemplo: si en tu mejor día vendes 6 cajas y el proveedor se ha demorado hasta 10 días, el stock de seguridad es 6 × 10 − 4 × 7 = 32 cajas, y el punto de reorden sube a 60.",
            "Mientras más caro te salga quedarte sin el producto, más margen conviene. Mientras más capital deje detenido tenerlo guardado, menos.",
          ],
        },
        {
          h: "Las fórmulas en Excel",
          body: [
            "Arma una tabla con una fila por producto y estas columnas:",
            {
              table: {
                head: ["", "A", "B", "C", "D"],
                rows: [
                  ["1", "Producto", "Stock", "Vendidas en 30 días", "Días de reposición"],
                  ["2", "Toalla de papel x20", "35", "120", "7"],
                ],
              },
            },
            "Escribe estas fórmulas en la fila 2 y cópialas hacia abajo para el resto de los productos:",
            {
              formulas: [
                { cell: "E2", what: "Consumo diario", formula: "=C2/30" },
                { cell: "F2", what: "Punto de reorden", formula: "=REDONDEAR.MAS(E2*D2*{factor};0)" },
                { cell: "G2", what: "¿Hay que pedir?", formula: '=SI(B2<F2;"Pedir";"OK")' },
                { cell: "H2", what: "Días de cobertura", formula: '=SI(E2>0;B2/E2;"")' },
                { cell: "I2", what: "Cantidad a pedir", formula: "=SI(B2<F2;REDONDEAR.MAS(F2+E2*{coverDays}-B2;0);0)" },
              ],
            },
            "Con el ejemplo: el consumo diario da 4 y el punto de reorden, 42. Quedan 35 cajas, que alcanzan para menos de 9 días, así que hay que pedir. La cantidad sugerida es 127: llegar al punto de reorden (42) más {coverDays} días de venta (120), menos lo que tienes (35).",
            "Las fórmulas están escritas para Excel en español, que separa con punto y coma y usa coma decimal. En Excel en inglés las funciones son ROUNDUP e IF, y se separa con comas: =ROUNDUP(E2*D2*{factorPlain},0).",
          ],
        },
        {
          h: "Errores comunes",
          body: [
            [
              "Calcular con un mes en que estuviste sin stock: si no había producto, vendiste menos de lo que te pidieron, y el consumo diario sale más bajo que el real.",
              "No actualizar los días de reposición: si el proveedor pasó de 7 a 15 días, el punto de reorden antiguo ya no te cubre.",
              "Usar el mismo punto de reorden todo el año en productos de temporada.",
              "Olvidar lo que ya está pedido: si hay un pedido en camino, súmalo al stock antes de decidir si pedir de nuevo.",
              "Calcularlo una vez y no volver a mirarlo: las ventas cambian, y conviene recalcular cada mes.",
            ],
          ],
        },
        {
          h: "Si no quieres armar las fórmulas",
          body: [
            "MiKardex hace estas mismas cuentas para todos tus productos a la vez. Subes tu Excel con producto, stock y unidades vendidas, y te muestra qué se agota primero y la lista de compra con la cantidad de cada producto, descontando lo que ya está pedido.",
            "La prueba es gratis y sin registro: {uploads} y {questions} preguntas al asistente.",
            { see: ["analysis", "kardex"] },
          ],
        },
      ],
      faqTitle: "Preguntas frecuentes",
      faq: [
        {
          q: "¿Punto de reorden y stock mínimo son lo mismo?",
          a: "No. El stock mínimo, o de seguridad, es el margen que no quieres tocar. El punto de reorden es más alto: incluye ese margen más lo que vas a vender mientras llega el pedido.",
        },
        {
          q: "¿Qué período de ventas uso?",
          a: "Uno que se parezca a lo que viene. Para productos estables, los últimos 30 a 90 días. Para productos de temporada, el mismo período del año anterior.",
        },
        {
          q: "¿Y si un producto casi no se vende?",
          a: "Con muy pocas ventas, el promedio diario dice poco. En esos casos funciona mejor fijar un mínimo a mano, por ejemplo una o dos unidades, y reponer cuando se vende.",
        },
      ],
      bottom: { h: "Calcula el punto de reorden de todo tu inventario", p: "Sube tu Excel y mira qué hay que pedir hoy, o prueba primero con los datos de ejemplo.", link: "Subir mi Excel o ver el ejemplo" },
    },
  },

  // Guide: what a kardex is and how to keep one in Excel, with a template to download. The
  // template is public/plantillas/plantilla-kardex-mikardex.xlsx; the example in this text is
  // the one loaded in that file, so the two have to change together.
  kardex: {
    es: {
      navLabel: "Kardex en Excel (plantilla)",
      seoTitle: "Kardex en Excel: plantilla gratis con fórmulas · MiKardex",
      seoDescription:
        "Descarga una plantilla de kardex en Excel con las fórmulas listas: entradas, salidas, saldo y costo promedio ponderado. Con un ejemplo paso a paso y los errores más comunes.",
      eyebrow: "Guía · control de inventario",
      h1: "Kardex en Excel: plantilla gratis y cómo llevarlo",
      lead: "Un kardex es el registro de cada entrada y cada salida de un producto, con el saldo que queda después de cada movimiento. Aquí puedes descargar una plantilla en Excel con las fórmulas listas y ver, paso a paso, cómo se llena y cómo se calcula.",
      download: {
        href: "/plantillas/plantilla-kardex-mikardex.xlsx",
        label: "Descargar la plantilla (Excel)",
        note: "Gratis y sin registro. Archivo .xlsx con fórmulas, sin macros.",
      },
      sections: [
        {
          h: "Qué trae la plantilla",
          body: [
            [
              "Una hoja por producto, con fórmulas para 300 movimientos.",
              "Entradas, salidas y saldo, en unidades y en valor.",
              "Costo promedio ponderado, que se recalcula solo con cada compra.",
              "Un aviso cuando el saldo queda negativo.",
              "Un ejemplo ya cargado y una hoja con las instrucciones.",
            ],
            "Tú escribes en las celdas amarillas: fecha, documento, cantidad y, en las compras, el costo. Lo demás sale de fórmulas básicas de Excel (SUMA y SI).",
          ],
        },
        {
          h: "Qué columnas lleva un kardex",
          body: [
            {
              table: {
                head: ["Grupo", "Columnas", "Qué se anota"],
                rows: [
                  ["Movimiento", "Fecha, documento, detalle", "Cuándo fue y con qué factura, boleta o guía"],
                  ["Entradas", "Cantidad, costo unitario, total", "Lo que entra: compras y devoluciones de clientes"],
                  ["Salidas", "Cantidad, costo unitario, total", "Lo que sale: ventas, mermas y consumo interno"],
                  ["Saldo", "Cantidad, costo promedio, total", "Lo que queda después del movimiento"],
                ],
              },
            },
          ],
        },
        {
          h: "Un ejemplo paso a paso",
          body: [
            "Es el ejemplo que viene cargado en la plantilla: un producto que parte con 100 unidades.",
            {
              table: {
                head: ["Fecha", "Movimiento", "Entrada", "Salida", "Saldo", "Costo promedio", "Valor del saldo"],
                rows: [
                  ["01-10", "Saldo inicial", "100 a $1.000", "", "100", "$1.000", "$100.000"],
                  ["05-10", "Compra", "50 a $1.200", "", "150", "$1.066,67", "$160.000"],
                  ["12-10", "Venta", "", "80", "70", "$1.066,67", "$74.667"],
                ],
              },
            },
            {
              steps: [
                "Partes con 100 unidades que te costaron $1.000 cada una: el saldo vale $100.000.",
                "Compras 50 a $1.200. Ahora tienes 150 unidades que valen $160.000, así que cada una vale en promedio $1.066,67.",
                "Vendes 80. Salen al costo promedio, $1.066,67 cada una, o sea $85.333. Quedan 70 unidades que valen $74.667.",
              ],
            },
          ],
        },
        {
          h: "Las fórmulas",
          body: [
            "En la plantilla ya vienen escritas. Si prefieres armar tu propio kardex, esta es la lógica de cada fila:",
            [
              "Saldo en unidades = saldo anterior + entrada − salida.",
              "Total de la entrada = cantidad × costo unitario.",
              "Costo de la salida = costo promedio del saldo anterior.",
              "Valor del saldo = valor anterior + total de la entrada − total de la salida.",
              "Costo promedio = valor del saldo ÷ unidades del saldo.",
            ],
            "Con las columnas en el mismo orden de la plantilla (entradas en D, E y F; salidas en G, H e I; saldo en J, K y L), las fórmulas de la fila 8 son:",
            {
              formulas: [
                { cell: "F8", what: "Total de la entrada", formula: "=D8*E8" },
                { cell: "H8", what: "Costo de la salida", formula: "=K7" },
                { cell: "I8", what: "Total de la salida", formula: "=G8*H8" },
                { cell: "J8", what: "Saldo en unidades", formula: "=J7+D8-G8" },
                { cell: "L8", what: "Valor del saldo", formula: "=L7+F8-I8" },
                { cell: "K8", what: "Costo promedio", formula: "=SI(J8=0;0;L8/J8)" },
              ],
            },
            "En la primera fila no hay saldo anterior: el saldo es la entrada inicial. De ahí en adelante, se copian hacia abajo.",
          ],
        },
        {
          h: "Promedio ponderado o PEPS",
          body: [
            "Son las dos formas más usadas de valorizar lo que sale.",
            [
              "Costo promedio ponderado: todas las unidades del saldo valen lo mismo, el promedio. Es el más simple de llevar en Excel y el que usa la plantilla.",
              "PEPS (primero en entrar, primero en salir; FIFO en inglés): lo que sale se valoriza al costo de la compra más antigua que queda. Refleja mejor los costos cuando cambian mucho, pero obliga a llevar la cuenta de cada compra por separado.",
            ],
            "Cualquiera sea el método, lo importante es usar siempre el mismo. Para efectos tributarios, confirma con tu contador cuál corresponde a tu empresa.",
          ],
        },
        {
          h: "Errores comunes",
          body: [
            [
              "Anotar los movimientos días después: el kardex solo sirve si está al día.",
              "Mezclar varios productos en la misma hoja: el saldo y el costo promedio dejan de tener sentido.",
              "Escribir encima de las fórmulas del saldo para que un número «cuadre»: si no cuadra, falta anotar un movimiento.",
              "No compararlo nunca con un conteo físico: el kardex dice lo que debería haber, y el conteo, lo que hay.",
              "Registrar una salida mayor que el saldo: la plantilla lo avisa con «Saldo negativo».",
            ],
            { see: ["counts"] },
          ],
        },
        {
          h: "Lo que el kardex no te dice",
          body: [
            "El kardex responde cuánto tienes y cuánto vale. No responde qué hay que reponer esta semana, cuánto pedir ni qué productos llevan meses sin venderse.",
            "Para eso está MiKardex: subes un Excel con tus productos, su stock y lo vendido, y ves qué se agota primero, la lista de compra y el stock sin movimiento. La prueba es gratis y sin registro.",
            { see: ["reorder", "analysis"] },
          ],
        },
      ],
      faqTitle: "Preguntas frecuentes",
      faq: [
        {
          q: "¿Qué es un kardex?",
          a: "Es la ficha de un producto donde se anota cada entrada y cada salida, con el saldo después de cada movimiento. El nombre viene de una marca de tarjeteros que se usaban para llevar estas fichas en papel.",
        },
        { q: "¿Sirve para varios productos?", a: "Sí, con una hoja por producto: copias la hoja Kardex y cambias el nombre del producto." },
        {
          q: "¿Kardex e inventario son lo mismo?",
          a: "No. El inventario es la lista de lo que tienes en un momento. El kardex es la historia de cómo llegaste ahí, movimiento por movimiento.",
        },
        { q: "¿Necesito macros o un Excel especial?", a: "No. Es un archivo .xlsx normal, con fórmulas básicas." },
      ],
      bottom: { h: "¿Ya tienes tu inventario en Excel?", p: "Sube el archivo y mira qué reponer y qué no se vende, o prueba primero con los datos de ejemplo.", link: "" },
    },
  },
};

export function landingText(id, lang) {
  return (TEXT[id] && TEXT[id][lang]) || null;
}
