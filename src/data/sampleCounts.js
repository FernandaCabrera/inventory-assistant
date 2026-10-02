// A made-up cycle count report, built the same way every time, so visitors can see the analysis
// before loading a file of their own. Every product, location, person and number here is invented.

const PRODUCTS = [
  ["LIM-1001", "Detergente líquido 5 L", "Liquid detergent 5 L", "Limpieza", "Cleaning", 9.8],
  ["LIM-1002", "Cloro gel 2 L", "Bleach gel 2 L", "Limpieza", "Cleaning", 3.4],
  ["LIM-1003", "Limpiavidrios 750 ml", "Glass cleaner 750 ml", "Limpieza", "Cleaning", 2.9],
  ["LIM-1004", "Desengrasante industrial 5 L", "Industrial degreaser 5 L", "Limpieza", "Cleaning", 14.5],
  ["LIM-1005", "Jabón de manos 1 L", "Hand soap 1 L", "Limpieza", "Cleaning", 4.1],
  ["LIM-1006", "Alcohol gel 500 ml", "Hand sanitizer 500 ml", "Limpieza", "Cleaning", 3.7],
  ["LIM-1007", "Lavalozas concentrado 1 L", "Dish soap concentrate 1 L", "Limpieza", "Cleaning", 3.2],
  ["LIM-1008", "Cera para pisos 4 L", "Floor wax 4 L", "Limpieza", "Cleaning", 12.6],
  ["PAP-2001", "Papel higiénico jumbo x6", "Jumbo toilet paper x6", "Papeles", "Paper", 11.2],
  ["PAP-2002", "Toalla de papel interfoliada x20", "Interfold paper towel x20", "Papeles", "Paper", 18.9],
  ["PAP-2003", "Servilletas blancas x500", "White napkins x500", "Papeles", "Paper", 5.6],
  ["PAP-2004", "Papel industrial 300 m", "Industrial wiper roll 300 m", "Papeles", "Paper", 16.4],
  ["PAP-2005", "Pañuelos faciales x100", "Facial tissues x100", "Papeles", "Paper", 1.9],
  ["BOL-3001", "Bolsa de basura 80x110 x10", "Garbage bag 80x110 x10", "Bolsas", "Bags", 2.6],
  ["BOL-3002", "Bolsa de basura 50x70 x20", "Garbage bag 50x70 x20", "Bolsas", "Bags", 1.8],
  ["BOL-3003", "Bolsa camiseta mediana x100", "Medium carry bag x100", "Bolsas", "Bags", 2.2],
  ["BOL-3004", "Film stretch 50 cm", "Stretch film 50 cm", "Bolsas", "Bags", 7.9],
  ["SEG-4001", "Guantes de nitrilo M x100", "Nitrile gloves M x100", "Seguridad", "Safety", 8.4],
  ["SEG-4002", "Guantes de nitrilo L x100", "Nitrile gloves L x100", "Seguridad", "Safety", 8.4],
  ["SEG-4003", "Mascarilla desechable x50", "Disposable mask x50", "Seguridad", "Safety", 4.6],
  ["SEG-4004", "Lentes de seguridad claros", "Clear safety glasses", "Seguridad", "Safety", 3.3],
  ["SEG-4005", "Cofia desechable x100", "Disposable hair net x100", "Seguridad", "Safety", 5.1],
  ["SEG-4006", "Chaleco reflectante", "Reflective vest", "Seguridad", "Safety", 6.8],
  ["UTE-5001", "Escobillón industrial", "Industrial push broom", "Utensilios", "Tools", 9.2],
  ["UTE-5002", "Mopa de algodón 400 g", "Cotton mop 400 g", "Utensilios", "Tools", 4.4],
  ["UTE-5003", "Balde con escurridor 20 L", "Mop bucket with wringer 20 L", "Utensilios", "Tools", 27.5],
  ["UTE-5004", "Paño de microfibra x5", "Microfibre cloth x5", "Utensilios", "Tools", 5.9],
  ["UTE-5005", "Esponja abrasiva x10", "Scouring sponge x10", "Utensilios", "Tools", 3.1],
  ["UTE-5006", "Pala con mango", "Dustpan with handle", "Utensilios", "Tools", 6.3],
  ["EMB-6001", "Caja de cartón 40x30x30", "Cardboard box 40x30x30", "Embalaje", "Packaging", 1.4],
  ["EMB-6002", "Cinta de embalaje 48 mm", "Packing tape 48 mm", "Embalaje", "Packaging", 1.6],
  ["EMB-6003", "Etiqueta térmica 100x150 rollo", "Thermal label 100x150 roll", "Embalaje", "Packaging", 6.7],
  ["EMB-6004", "Papel kraft 25 kg", "Kraft paper 25 kg", "Embalaje", "Packaging", 31.0],
  ["EMB-6005", "Zuncho plástico 12 mm", "Plastic strapping 12 mm", "Embalaje", "Packaging", 22.4],
  ["DIS-7001", "Dispensador de jabón 1 L", "Soap dispenser 1 L", "Dispensadores", "Dispensers", 13.8],
  ["DIS-7002", "Dispensador de toalla interfoliada", "Interfold towel dispenser", "Dispensadores", "Dispensers", 19.6],
];

const HEADERS = {
  es: [
    "Fecha conteo", "Fecha contabilización", "Bodega", "Ubicación", "Código", "Descripción", "Stock sistema", "Stock contado",
    "Diferencia unidades", "Lote", "Valor sistema", "Valor contado", "Diferencia valor", "Motivo", "Contado por", "Categoría",
  ],
  en: [
    "Create Date", "Posted Date", "Whse", "Location", "Item Code", "Description", "Current Stock", "Counted Stock",
    "Unit Difference", "Batch", "Current Value", "Counted Value", "Cost Difference", "Reason", "Counted by", "Category",
  ],
};

const REASONS = {
  es: ["Error de picking", "Ubicación equivocada", "Error de recepción", "Dañado", "Vencido", ""],
  en: ["Picking error", "Wrong location", "Receiving error", "Damaged", "Expired", ""],
};
const REASON_WEIGHTS = [34, 20, 16, 13, 7, 10];
const LOT_REASON = { es: "Cruce de lote", en: "Lot mix-up" };
const COUNTERS = ["Camila R.", "Diego M.", "Paula S.", "Tomás V."];

export const SAMPLE_COUNT_TOTAL_LOCATIONS = 480; // 6 aisles x 16 racks x 5 levels
export const SAMPLE_COUNT_FILE = { es: "Datos de ejemplo", en: "Sample data" };

const DAY = 86400000;
const START = Date.UTC(2026, 5, 1); // Monday June 1, 2026
const WEEKS = 13;
const ZONES = ["A", "B", "C", "D", "E", "F"];

// Small repeatable random generator, so the example never changes between visits
function generator(seed) {
  let a = seed;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// Returns the report as a grid of cells, like a spreadsheet read from disk.
export function sampleCountGrid(lang) {
  const es = lang === "es";
  const rate = es ? 700 : 1; // costs in pesos or in dollars
  const random = generator(20260601);
  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const weighted = (weights) => {
    let roll = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i += 1) {
      roll -= weights[i];
      if (roll < 0) return i;
    }
    return weights.length - 1;
  };

  const locations = [];
  ZONES.forEach((zone) => {
    for (let rack = 1; rack <= 16; rack += 1) {
      for (let level = 1; level <= 5; level += 1) locations.push(`${zone}-${String(rack).padStart(2, "0")}-${level}`);
    }
  });
  // every location holds one product (some hold two lots of it)
  const stockAt = new Map();
  const troubled = ["D-04-2", "D-11-1", "B-07-3"]; // locations that come up wrong more than once
  locations.forEach((location, i) => {
    const lots = random() < 0.22 && !troubled.includes(location) ? 2 : 1;
    stockAt.set(location, { product: PRODUCTS[(i * 7 + between(0, 3)) % PRODUCTS.length], lots });
  });
  // shuffle the order in which locations get counted
  const order = locations.slice();
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const swaps = { 9: "C-05-2", 27: "E-12-4", 48: "A-09-1" }; // working day -> location with two lots crossed
  const big = { 14: ["UTE-5003", -9], 33: ["EMB-6004", -7], 41: ["PAP-2002", -22], 52: ["DIS-7002", 8], 58: ["LIM-1004", -12] };

  const rows = [];
  const money = (value) => Math.round(value * rate * 100) / 100;
  const lotCode = (ms, n) => `L${iso(ms - (40 + n * 23) * DAY).replace(/-/g, "").slice(2)}`;

  function addLine(date, dayIndex, location, product, lot, book, diff, reason, counter) {
    const last = dayIndex >= WEEKS * 5 - 3;
    const posted = last && random() < 0.5 ? "" : iso(date + between(0, 3) * DAY);
    const cost = product[5];
    rows.push([
      iso(date), posted, "CD1", location, product[0], es ? product[1] : product[2], book, book + diff, diff, lot,
      money(book * cost), money((book + diff) * cost), money(diff * cost), reason, counter, es ? product[3] : product[4],
    ]);
  }

  let cursor = 0;
  for (let dayIndex = 0; dayIndex < WEEKS * 5; dayIndex += 1) {
    const date = START + (Math.floor(dayIndex / 5) * 7 + (dayIndex % 5)) * DAY;
    const month = new Date(date).getUTCMonth(); // 5 = June, 6 = July, 7 = August
    const errorRate = month <= 5 ? 0.05 : month === 6 ? 0.035 : 0.02; // the count gets better over the quarter
    const counter = COUNTERS[(dayIndex + Math.floor(dayIndex / 5)) % COUNTERS.length];
    const today = [];
    const perDay = between(4, 7);
    for (let i = 0; i < perDay; i += 1) {
      today.push(order[cursor % order.length]);
      cursor += 1;
    }
    if (dayIndex % 21 === 6) today.push(troubled[0]);
    if (dayIndex % 26 === 11) today.push(troubled[1]);
    if (dayIndex % 30 === 17) today.push(troubled[2]);
    if (swaps[dayIndex]) today.push(swaps[dayIndex]);

    today.forEach((location) => {
      const held = stockAt.get(location);
      const product = big[dayIndex] && location === today[0] ? PRODUCTS.find((p) => p[0] === big[dayIndex][0]) : held.product;

      if (swaps[dayIndex] === location) {
        // one lot shows too many, the other too few: the stock is there, under the wrong lot
        const units = between(8, 24);
        const leftover = dayIndex === 27 ? -2 : 0;
        addLine(date, dayIndex, location, product, lotCode(date, 1), between(30, 80), units, LOT_REASON[es ? "es" : "en"], counter);
        addLine(date, dayIndex, location, product, lotCode(date, 2), between(30, 80) + units, -units + leftover, LOT_REASON[es ? "es" : "en"], counter);
        return;
      }
      for (let lot = 1; lot <= held.lots; lot += 1) {
        const book = between(6, 140);
        let diff = 0;
        const zoneFactor = location.startsWith("D") ? 3 : 1; // aisle D is the picking aisle
        if (troubled.includes(location) && lot === 1) diff = -between(1, 5);
        else if (big[dayIndex] && location === today[0] && lot === 1) diff = big[dayIndex][1];
        else if (random() < errorRate * zoneFactor) diff = (random() < 0.62 ? -1 : 1) * between(1, 6);
        diff = Math.max(diff, -book);
        const reason = diff === 0 ? "" : REASONS[es ? "es" : "en"][weighted(REASON_WEIGHTS)];
        addLine(date, dayIndex, location, product, lotCode(date, lot), book, diff, reason, counter);
      }
    });
  }

  return [
    [es ? "Reporte de conteos cíclicos (datos inventados)" : "Cycle count report (invented data)"],
    [],
    HEADERS[es ? "es" : "en"],
    ...rows,
  ];
}
