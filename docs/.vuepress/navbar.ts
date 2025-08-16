/**
 * @see https://theme-plume.vuejs.press/config/navigation/ 查看文档了解配置详情
 *
 * Navbar 配置文件，它在 `.vuepress/plume.config.ts` 中被导入。
 */

import { defineNavbarConfig } from 'vuepress-theme-plume'

export const zhNavbar = defineNavbarConfig([
  // { text: '关于我👩‍💼', link: '/aboutme/' },
  { text: '基础知识🧀', link: '/baseKnowledge/' },
  { text: '源码学习📚', link: '/sourceCode/' },

  { text: '工作实践💻', link: '/practice/' },
  // { text: '工作实践💻', items: [
  //   { text: '性能优化', link: '/practice/performance/' },
  //   { text: 'UI', link: '/practice/UI/' },
  //   {text:'逻辑层', link: '/practice/logic/'},
  //   // 可以继续添加更多子项
  // ] },
  // {
  //   text: 'leetCode💡',
  //   link: '/leetcode/',
  // },
  {
    text: '开卷有益📖',
    link: '/read/',
    // items: [{ text: '示例', link: '/notes/demo/README.md' }]
  },
  //  { text: '归档', link: '/blog/archives/' },
])



