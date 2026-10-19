import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

type Cell = string | number | { value: number; style: number };

const PERCENT = 1;
const DATE = 2;

const AS_OF = Date.UTC(2026, 6, 27);
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

const pct = (value: number): Cell => ({ value, style: PERCENT });

const DISCLAIMER: Cell[][] = [
  ["Important information"],
  ["This document is for information purposes only and is not an offer."],
  ["Past performance is not a reliable indicator of future results."],
];

const HOLDINGS: Cell[][] = [
  ["Synthetic Global Equity UCITS ETF - Holdings"],
  [
    "Holdings as of",
    { value: (AS_OF - EXCEL_EPOCH) / 86_400_000, style: DATE },
  ],
  [],
  ["Ticker", "Name", "Sector", "Location", "Weight (%)"],
  [
    "AAAA",
    "Alpha Corp",
    "Information Technology",
    "United States",
    pct(0.1508),
  ],
  ["BBBB", "Beta Holdings Inc", "Financials", "United States", pct(0.1225)],
  [6857, "Gamma Industries", "Industrials", "Japan", pct(0.11)],
  ["CCCC", "Delta Plc", "Consumer Staples", "United Kingdom", pct(0.095)],
  ["DDDD", "Epsilon SA", "Health Care", "France", pct(0.0875)],
  ["SAN", "Zeta Bank SA", "Financials", "Spain", pct(0.08)],
  ["SAN", "Eta Pharma SA", "Health Care", "France", pct(0.0742)],
  ["EEEE", "Theta AG", "Materials", "Switzerland", pct(0.07)],
  ["FFFF", "Iota NV", "Information Technology", "Netherlands", pct(0.065)],
  ["GGGG", "Kappa Ltd", "Communication", "Taiwan", pct(0.06)],
  ["HHHH", "Lambda Inc", "Utilities", "United States", pct(0.06)],
  ["-", "EUR CASH", "Cash and/or Derivatives", "-", pct(0.025)],
];

const xml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const column = (index: number) => String.fromCharCode(65 + index);

function sheetXml(rows: Cell[][], strings: string[], merge?: string): string {
  const stringIndex = (text: string) => {
    const at = strings.indexOf(text);
    return at >= 0 ? at : strings.push(text) - 1;
  };
  const body = rows
    .map((cells, r) => {
      const xmlCells = cells.map((cell, c) => {
        const ref = `${column(c)}${r + 1}`;
        if (typeof cell === "string") {
          return `<c r="${ref}" t="s"><v>${stringIndex(cell)}</v></c>`;
        }
        if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
        return `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`;
      });
      return `<row r="${r + 1}">${xmlCells.join("")}</row>`;
    })
    .join("");
  const merged = merge
    ? `<mergeCells count="1"><mergeCell ref="${merge}"/></mergeCells>`
    : "";
  return xml(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData>${merged}</worksheet>`,
  );
}

function workbookParts(): [string, string][] {
  const strings: string[] = [];
  const disclaimer = sheetXml(DISCLAIMER, strings);
  const holdings = sheetXml(HOLDINGS, strings, "A1:E1");
  const sharedStrings = xml(
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
      .map((s) => `<si><t>${escape(s)}</t></si>`)
      .join("")}</sst>`,
  );
  const rel =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const type = "application/vnd.openxmlformats-officedocument.spreadsheetml";

  return [
    [
      "[Content_Types].xml",
      xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${type}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${type}.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="${type}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${type}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${type}.sharedStrings+xml"/></Types>`,
      ),
    ],
    [
      "_rels/.rels",
      xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    ],
    [
      "xl/workbook.xml",
      xml(
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets><sheet name="Disclaimer" sheetId="1" r:id="rId1"/><sheet name="Holdings" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      ),
    ],
    [
      "xl/_rels/workbook.xml.rels",
      xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rId4" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      ),
    ],
    [
      "xl/styles.xml",
      xml(
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
      ),
    ],
    ["xl/sharedStrings.xml", sharedStrings],
    ["xl/worksheets/sheet1.xml", disclaimer],
    ["xl/worksheets/sheet2.xml", holdings],
  ];
}

function zip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function issuerWorkbook(): Buffer {
  return zip(workbookParts());
}

export const ISSUER_XLSX = fileURLToPath(
  new URL("./issuer.xlsx", import.meta.url),
);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(ISSUER_XLSX, issuerWorkbook());
  console.log(`Wrote ${ISSUER_XLSX}`);
}
