import type { ReactNode } from "react";

/** Contains headings and plain text rows for the shared table. */
interface TableProps {
  headings: string[];
  rows: string[][];
}

/** Creates table heading cells without hiding iteration in callbacks. */
function createHeadingCells(headings: string[]): ReactNode[] {
  const cells: ReactNode[] = [];

  for (const heading of headings) {
    cells.push(<th key={heading}>{heading}</th>);
  }

  return cells;
}

/** Creates one row of plain table cells. */
function createRowCells(row: string[], rowIndex: number): ReactNode[] {
  const cells: ReactNode[] = [];

  for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
    cells.push(<td key={`${rowIndex}-${cellIndex}`}>{row[cellIndex]}</td>);
  }

  return cells;
}

/** Creates table rows without adding feature-specific behavior. */
function createRows(rows: string[][]): ReactNode[] {
  const renderedRows: ReactNode[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    renderedRows.push(
      <tr key={rowIndex}>{createRowCells(rows[rowIndex], rowIndex)}</tr>,
    );
  }

  return renderedRows;
}

/** Renders a small reusable table for admin lists. */
export function Table({ headings, rows }: TableProps): React.JSX.Element {
  return (
    <table className="ui-table">
      <thead>
        <tr>{createHeadingCells(headings)}</tr>
      </thead>
      <tbody>{createRows(rows)}</tbody>
    </table>
  );
}
