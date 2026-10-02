import JSZip from "jszip";
import { readXlsxSheets, parseSheet, parseSharedStrings, decodeXml } from "./xlsxReader";
import { pickSheet, guessMapping, buildInventory } from "./importLogic";
import { statusFor } from "./inventoryLogic";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// A workbook like the ones people really upload: an instructions sheet, a hidden sheet,
// a movements log, and the inventory sheet with a title above the header, formulas with
// saved values, an Excel table, styled empty cells, shared and inline strings.
async function buildWorkbook() {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<workbook ${NS} xmlns:r="${REL}"><sheets>` +
      `<sheet name="Start Here" sheetId="1" r:id="rId1"/>` +
      `<sheet name="Secret" sheetId="2" state="hidden" r:id="rId2"/>` +
      `<sheet name="Movements" sheetId="3" state="visible" r:id="rId3"/>` +
      `<sheet name="Stock &amp; Status" sheetId="4" r:id="rId4"/>` +
      `</sheets></workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/>` +
      `<Relationship Id="rId3" Type="${REL}/worksheet" Target="/xl/worksheets/sheet3.xml"/>` +
      `<Relationship Id="rId4" Type="${REL}/worksheet" Target="worksheets/sheet4.xml"/>` +
      `<Relationship Id="rId5" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
      `<Relationship Id="rId6" Type="${REL}/styles" Target="styles.xml"/>` +
      `</Relationships>`
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<sst ${NS}><si><t>SKU</t></si><si><r><rPr><b/></rPr><t>Product </t></r><r><t>Name</t></r></si><si/>` +
      `<si><t>Caf&#233; &amp; T&#xE9;</t><rPh sb="0" eb="1"><t>ignored</t></rPh></si></sst>`
  );
  zip.file("xl/worksheets/sheet1.xml", `<worksheet ${NS}><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>How to use this workbook</t></is></c></row></sheetData></worksheet>`);
  zip.file("xl/worksheets/sheet2.xml", `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hidden</t></is></c></row></sheetData></worksheet>`);
  zip.file(
    "xl/worksheets/sheet3.xml",
    `<worksheet ${NS}><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Date</t></is></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Quantity</t></is></c></row>` +
      Array.from({ length: 50 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}"><v>46000</v></c><c r="B${i + 2}" t="inlineStr"><is><t>A-1</t></is></c><c r="C${i + 2}"><v>${i}</v></c></row>`).join("") +
      `</sheetData></worksheet>`
  );
  zip.file(
    "xl/worksheets/sheet4.xml",
    `<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="12"/></cols><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Stock Status</t></is></c></row>` +
      `<row r="2"/>` +
      `<row r="4" spans="1:8"><c r="A4" s="3" t="s"><v>0</v></c><c r="B4" s="3" t="s"><v>1</v></c><c r="C4" t="inlineStr"><is><t>Unit Cost (USD)</t></is></c>` +
      `<c r="D4" t="inlineStr"><is><t>Current Stock</t></is></c><c r="E4" t="inlineStr"><is><t>Avg Daily Sales</t></is></c>` +
      `<c r="F4" t="inlineStr"><is><t>Lead Time (days)</t></is></c><c r="G4" t="inlineStr"><is><t>Min Order Qty</t></is></c><c r="H4" t="inlineStr"><is><t>Reorder Point</t></is></c></row>` +
      `<row r="5"><c r="A5" t="inlineStr"><is><t>DRY-101</t></is></c><c r="B5" t="str"><f>INDEX(tblProducts[Name],1)</f><v>Rice 10 kg</v></c><c r="C5"><v>14.5</v></c>` +
      `<c r="D5"><f>SUMIFS(tblMovements[Qty],tblMovements[SKU],A5)</f><v>121</v></c><c r="E5"><f>X/30</f><v>1.6E1</v></c><c r="F5"><v>5</v></c><c r="G5"><v>40</v></c><c r="H5"><f>ROUNDUP(E5*F5*2,0)</f><v>160</v></c></row>` +
      `<row r="6"><c r="A6" t="inlineStr"><is><t>DRY-102</t></is></c><c r="B6" t="s"><v>3</v></c><c r="C6" s="2"/><c r="D6"><v>0</v></c><c r="E6"><v>0</v></c><c r="F6"><v>5</v></c><c r="G6" t="e"><v>#N/A</v></c><c r="H6" t="b"><v>1</v></c></row>` +
      `</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`
  );
  // an Excel table with no totals row: the kind of part that breaks full-featured readers
  zip.file("xl/tables/table1.xml", `<table ${NS} id="1" name="tblStockStatus" displayName="tblStockStatus" ref="A4:H6"><autoFilter ref="A4:H6"/></table>`);
  return zip.generateAsync({ type: "uint8array" });
}

test("decodeXml handles entities and Excel escapes", () => {
  expect(decodeXml("A &amp; B &lt;1&gt; &#233; &#xE9; line_x000A_break")).toBe("A & B <1> é é line\nbreak");
});

test("parseSharedStrings keeps positions, joins rich text, drops phonetic text", () => {
  const strings = parseSharedStrings(`<sst><si><t>a</t></si><si/><si><r><t>b</t></r><r><t xml:space="preserve"> c</t></r></si><si><t>d</t><rPh><t>x</t></rPh></si></sst>`);
  expect(strings).toEqual(["a", "", "b c", "d"]);
});

test("parseSheet places cells by reference, with or without it", () => {
  const grid = parseSheet(
    `<sheetData><row><c r="C1"><v>3</v></c></row><row><c><v>1</v></c><c><v>2</v></c></row><row r="9"><c r="AA9" t="str"><v>far</v></c></row></sheetData>`,
    []
  );
  expect(grid[0]).toEqual(["", "", 3]);
  expect(grid[1]).toEqual([1, 2]);
  expect(grid[2][26]).toBe("far");
});

test("reads a real-world workbook: visible sheets, saved formula values, tables ignored", async () => {
  const sheets = await readXlsxSheets(await buildWorkbook());
  expect(sheets.map((s) => s.name)).toEqual(["Start Here", "Movements", "Stock & Status"]);

  const stock = sheets[2].grid;
  expect(stock[0]).toEqual(["Stock Status"]);
  expect(stock[1]).toEqual(["SKU", "Product Name", "Unit Cost (USD)", "Current Stock", "Avg Daily Sales", "Lead Time (days)", "Min Order Qty", "Reorder Point"]);
  expect(stock[2]).toEqual(["DRY-101", "Rice 10 kg", 14.5, 121, 16, 5, 40, 160]);
  expect(stock[3]).toEqual(["DRY-102", "Café & Té", "", 0, 0, 5, "", true]);
});

test("picks the inventory sheet, not the longest one, and maps its columns", async () => {
  const sheets = await readXlsxSheets(await buildWorkbook());
  const { candidates, bestIndex } = pickSheet(sheets);
  expect(candidates[bestIndex].name).toBe("Stock & Status");

  const { table, mapping } = candidates[bestIndex];
  expect(table.rows).toHaveLength(2);
  expect(mapping).toMatchObject({
    sku: 0, name: 1, unit_cost: 2, stock: 3, avg_daily_usage: 4, lead_time_days: 5, reorder_point: 7,
    sales: null, warehouse: null,
  });

  const { items } = buildInventory(table, mapping, { salesPeriodDays: 30, defaultLeadTime: 7, defaultWarehouse: "Main" });
  expect(items[0]).toMatchObject({ sku: "DRY-101", name: "Rice 10 kg", stock: 121, avg_daily_usage: 16, reorder_point: 160, lead_time_days: 5, unit_cost: 14.5 });
  expect(statusFor(items[0])).toBe("low");
});

test("pickSheet reports nothing usable for an empty workbook", () => {
  expect(pickSheet([{ name: "A", grid: [] }]).bestIndex).toBe(-1);
});

describe("column matching on planning workbooks", () => {
  test("minimum order quantity and safety stock are not taken as reorder point or stock", () => {
    const m = guessMapping(["SKU", "Product Name", "Unit Cost (USD)", "Lead Time (days)", "Safety Stock (days)", "Min Order Qty"]);
    expect(m.reorder_point).toBeNull();
    expect(m.stock).toBeNull();
    expect(m).toMatchObject({ sku: 0, name: 1, unit_cost: 2, lead_time_days: 3 });
  });

  test("stock value, target stock and order quantities are not the stock on hand", () => {
    const m = guessMapping(["Código", "Stock Value (USD)", "Target Stock", "Suggested Order Qty", "Open PO Qty", "Existencias"]);
    expect(m.stock).toBe(5);
  });

  test("minimum stock still maps to the reorder point", () => {
    expect(guessMapping(["Producto", "Stock", "Stock mínimo"]).reorder_point).toBe(2);
    expect(guessMapping(["Product", "Stock", "Min stock level"]).reorder_point).toBe(2);
  });
});
