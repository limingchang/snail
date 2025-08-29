<template>
  <div class="tool-table">
    <div class="tool-table-insert">
      <Popover title="插入普通表格" placement="bottom">
        <template #content>
          <div class="table-selector">
            <div class="table-grid">
              <div v-for="(_, rowIndex) in 8" :key="`row-${rowIndex}`" class="grid-row">
                <div v-for="(_, colIndex) in 8" :key="`cell-${rowIndex}-${colIndex}`" class="grid-cell" :class="{
                  'highlighted': isHighlighted(rowIndex, colIndex)
                }" @mouseenter="onCellHover(rowIndex, colIndex)" @click="onCellClick(rowIndex + 1, colIndex + 1)"></div>
              </div>
            </div>
            <div class="table-info">
              {{ hoveredRows }} × {{ hoveredCols }} 表格
            </div>
          </div>
        </template>
        <Button :icon="h(TableOutlined)" size="small" @click="handleInsertTable">插入表格</Button>
      </Popover>
      <Popover title="插入布局定位表(一般用于分栏布局)">
        <template #content>
          <div class="table-selector">
            <div class="table-grid layout">
              <div v-for="(_, rowIndex) in 8" :key="`row-${rowIndex}`" class="grid-row">
                <div v-for="(_, colIndex) in 8" :key="`cell-${rowIndex}-${colIndex}`" class="grid-cell" :class="{
                  'highlighted': isHighlighted(rowIndex, colIndex)
                }" @mouseenter="onCellHover(rowIndex, colIndex)" @click="onCellClick(rowIndex + 1, colIndex + 1)"></div>
              </div>
            </div>
            <div class="table-info">
              {{ hoveredRows }} × {{ hoveredCols }} 表格
            </div>
          </div>
        </template>
        <Button size="small" :icon="h(IconLayout)" @click="handleInsertLayoutTable">插入布局表</Button>
      </Popover>
    </div>
    <div class="tool-table-operation">
      <Button :icon="h(IconMergeCells)" size="small">合并单元格</Button>
      <Button :icon="h(IconUnMergeCells)" size="small">取消合并</Button>
    </div>
  </div>

</template>

<script setup lang="ts">
import { h, ref } from "vue";
import { Button, Tooltip, Popover } from "ant-design-vue";
import { TableOutlined } from "@ant-design/icons-vue";
import { IconLayout, IconMergeCells, IconUnMergeCells } from "@snail-js/vue";
import { Editor } from "@tiptap/vue-3";

import { defaultLayoutTable } from "../contents/defaultTable";

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null,
  },
});

// 表格选择器状态
const hoveredRows = ref(1);
const hoveredCols = ref(1);

// 检查单元格是否应该高亮
const isHighlighted = (rowIndex: number, colIndex: number) => {
  return rowIndex < hoveredRows.value && colIndex < hoveredCols.value;
};

// 鼠标悬停事件
const onCellHover = (rowIndex: number, colIndex: number) => {
  hoveredRows.value = rowIndex + 1;
  hoveredCols.value = colIndex + 1;
};

// 单元格点击事件
const onCellClick = (rows: number, cols: number) => {
  console.log('col:', cols, 'row:', rows);

  // 插入选定大小的表格
  props.editor
    .chain()
    .focus()
    .insertTable({ rows, cols, withHeaderRow: true })
    .insertContent({ type: "paragraph" })
    .run();
};

// 插入普通表格
const handleInsertTable = async () => {
  // props.editor.chain().focus().insertContent(defaultTable).run()
  props.editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .insertContent({ type: "paragraph" })
    .run();
  // props.editor.chain()
};

const handleInsertLayoutTable = () => {
  props.editor
    .chain()
    .focus()
    .insertContent(defaultLayoutTable)
    .run();
}


</script>

<style lang="scss" scoped>
.tool-table{
  width: 240px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between
}
.tool-table-insert {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between
}

.tool-table-operation {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.table-selector {
  padding: 8px;

  .table-grid {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: 8px;

    .grid-row {
      display: flex;
      gap: 1px;

      .grid-cell {
        width: 16px;
        height: 16px;
        border: 1px solid #d9d9d9;
        background-color: #ffffff;
        cursor: pointer;
        transition: background-color 0.2s ease;

        &:hover {
          background-color: #e6f7ff;
        }

        &.highlighted {
          background-color: #1890ff;
          border-color: #1890ff;
        }
      }
    }

    &.layout {
      .grid-row {
        .grid-cell {
          &.highlighted {
            background-color: #F56C6C;
            border-color: #F56C6C;
          }
        }
      }
    }
  }

  .table-info {
    text-align: center;
    font-size: 12px;
    color: #666;
    padding: 4px 0;
  }
}
</style>
