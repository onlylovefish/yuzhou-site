/**
 * @see https://theme-plume.vuejs.press/config/navigation/ 查看文档了解配置详情
 *
 * Navbar 配置文件，它在 `.vuepress/plume.config.ts` 中被导入。
 */

import { defineNavbarConfig } from 'vuepress-theme-plume'

export const zhNavbar = defineNavbarConfig([
  { text: '关于我', link: '/aboutme' },
  { text: '基础知识', link: '/blog/' },
  { text: '源码学习', link: '/blog/tags/' },
  { text: '工作实践', link: '/blog/archives/' },
  { text: '手撕系列', link: '/blog/archives/' },
  {
    text: '开卷有益📖',
    items: [{ text: '示例', link: '/notes/demo/README.md' }]
  },
])

export const enNavbar = defineNavbarConfig([
  { text: 'Home', link: '/en/' },
  { text: 'Blog', link: '/en/blog/' },
  { text: 'Tags', link: '/en/blog/tags/' },
  { text: 'Archives', link: '/en/blog/archives/' },
  {
    text: 'Notes',
    items: [{ text: 'Demo', link: '/en/notes/demo/README.md' }]
  },
])

