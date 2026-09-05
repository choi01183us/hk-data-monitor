// 細 CSV 解析器。
//
// 唔用 npm 套件:SPEC 第 3 節「避免引入額外 runtime 依賴」,而且政府 CSV 得幾十行,
// 一個 RFC 4180 嘅簡化版就夠 —— 但要識處理引號、逗號喺引號入面、CRLF 同 BOM。
//
// 香港政府 CSV 實測形狀(findings.md):UTF-8 with BOM,標題行帶單位
// (例如「教育 (百萬元)」),期數帶註釋尾巴(例如「2026-27 (原來預算)」)。
// 呢啲唔喺呢度處理 —— 呢度只負責把文字變成格,語義由各自嘅 adapter 決定。

/**
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {
  const table = [];
  let row = [];
  let cell = "";
  let quoted = false;

  const source = text.replace(/^﻿/, "");

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      table.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    table.push(row);
  }

  const nonEmpty = table.filter((cells) => cells.some((value) => value.trim() !== ""));
  if (nonEmpty.length === 0) {
    throw new Error("CSV 係空的");
  }

  const headers = nonEmpty[0].map((header) => header.trim());
  const rows = nonEmpty.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `CSV 第 ${index + 2} 行有 ${cells.length} 格,標題有 ${headers.length} 格 —— 唔對齊,唔好猜`
      );
    }
    return Object.fromEntries(headers.map((header, column) => [header, cells[column].trim()]));
  });

  return { headers, rows };
}

/**
 * 政府 CSV 嘅數字格:可能有千位逗號、可能係空、可能係「-」代表冇。
 * 冇數一律回 null,唔好回 0 —— SPEC 第 2 節第 4 條唔准估數。
 */
export function toNumber(text) {
  if (text === null || text === undefined) return null;
  const cleaned = String(text).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "–" || cleaned === "N.A." || cleaned === "n.a.") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}
