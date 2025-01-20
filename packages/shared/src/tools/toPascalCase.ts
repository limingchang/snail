/**
 * 将字符串转换大驼峰。
 * 
 * @param {string} str - 要转换的字符串。
 * @param {string} separator - 用于分割单词的分隔符，默认为短横线（-）。
 * @returns {string} 转换后的大驼峰字符串。
 */
export function toPascalCase (str: string, separator = '-'): string  {
  // 分割字符串为数组，每个元素是以短横线分隔的单词
  const words = str.split(separator);
  // 遍历数组，将每个单词的首字母大写，然后拼接成字符串
  return words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
}