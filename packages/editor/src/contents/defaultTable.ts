const defaultCell = {
  type: "tableCell",
  content: [
    {
      type: "paragraph",
    },
  ],
};

const defaultRow = {
  type: "tableRow",
  content: [defaultCell, defaultCell, defaultCell],
};

export const defaultTable = {
  type: "table",
  attrs: {
    layout: true,
  },
  content: [defaultRow, defaultRow],
};

export const defaultLayoutTable = {
  type: "table",
  attrs: {
    class: "layout",
  },
  content: [defaultRow, defaultRow],
};
