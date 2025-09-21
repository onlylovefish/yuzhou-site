---
title: Fiber树构造
createTime: 2025/09/21 17:01:46
permalink: /article/uqo2htfm/
---

![alt text](./img/react-reconciler运作流程.png)

fiber树构造处于上述运作流程中的第三个阶段，执行任务回调，从scheduler调度中心的角度看，他是任务队列taskQueue中的一个具体的任务回调(task.callback)，从react工作循环角度看，属于fiber树构造循环

Fiber树构造有两种情况，一种是初次创建流程，一种是对比更新流程

初次创建在react首次启动时，界面还没有完全渲染，此时不回进入对比流程，相当于直接创建一棵全新的树

对比更新，React引用启动后，界面已经渲染，如果在此发生更新，创建新Fiber会和旧Fiber进行对比

## ReactElement、Fiber、DOM

1. ReactElement对象：所有采用jsx语法书写的节点, 都会被编译器转换, 最终会以React.createElement(...)的方式, 创建出来一个与之对应的ReactElement对象

2. Fiber对象：fiber对象是通过ReactElement对象进行创建的, 多个fiber对象构成了一棵fiber树, fiber树是构造DOM树的数据模型, fiber树的任何改动, 最后都体现到DOM树.

3. DOM对象：DOM将文档解析为一个由节点和对象（包含属性和方法的对象）组成的结构集合, 也就是常说的DOM树.
JavaScript可以访问和操作存储在 DOM 中的内容, 也就是操作DOM对象, 进而触发 UI 渲染.
![alt text](./img/DOM转换过程.png)
上图表示JSX代码到DOM节点的转换过程，也就是说JSX->ReactElement->Fiber->DOM

Fiber树通过ReactElement生成，Fiber树是DOM树的数据模型，Fiber树驱动DOM

