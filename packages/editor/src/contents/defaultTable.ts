export const defaultCell = {
  type: "tableCell",
  content: [
    {
      type: "paragraph",
    },
  ],
};

const defaultRow = {
  type: "tableRow",
  content: [defaultCell, defaultCell, defaultCell, defaultCell],
};

export const defaultTable = {
  type: "table",
  content: [defaultRow, defaultRow, defaultRow, defaultRow],
};

