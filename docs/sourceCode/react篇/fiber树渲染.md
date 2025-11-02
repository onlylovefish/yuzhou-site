---
title: Fiber树渲染
createTime: 2025/11/02 16:56
permalink: /article/Fiber树渲染/
---

## reconciler运作流程
![alt text](./img/reconciler运作流程.png)

1. 输入阶段：衔接```react-dom```包，承接fiber更新请求
2. 注册调度任务：与调度中心（scheduler包）交互，注册调度任务task，等待任务回调
3. 执行任务回调：在内存中构造出fiber树和dom对象
4. 输出：与渲染器(react-dom)交互，渲染dom节点

fiber树渲染处于reconciler最后输出阶段，

## fiber树特点
1. 首次构造和对比更新，最终都会在内存中生成一颗用于渲染页面的fiber树(fiber.finishedWork)，特点如下
- 副作用队列挂载在 根节点(finishedWork.firstEffect)
- 代表最新页面的DOM对象挂载在fiber树中首个HostComponent类型的节点上（DOM对象挂载在fiber.stateNode属性上）


## commitRoot
渲染逻辑在commitRoot函数,整个函数分为三个阶段
1. 渲染前（dom变更前）,commitBeforeMutationEffects
2. 渲染中（dom变更），commitMutationEffects
3. 渲染后（dom变更后）commitLayoutEffects

```js
function Test() {
  console.log(1);
  useEffect(() => {
    console.log(2);
  });
  console.log(3);
  Promise.resolve().then(() => {
    console.log(4);
  });
  return <div>test</div>;
}
// 1、3：同步代码，立即输出。
// 4：Promise 的 .then，属于微任务队列，在同步代码后执行。
// 2：useEffect 的回调，在 DOM 更新后执行，属于宏任务队列，通常在微任务之后。
```
理论输出顺序为 13 4 2，但是我在react playground下输出为 13 2 4，有点奇怪

另外说明下如果resolve没有.then实际返回的是一个函数，并不会执行
```js
// 该
Promise.resolve(()=>{
    console.log(4)
})
```
第三个点是关于useEffect 

在 React 中，useEffect 的依赖数组（第二个参数）决定了副作用的执行时机：

1. 没有依赖数组（即 useEffect(() => { ... })）：
2. 每次组件渲染后都会执行（包括首次和每次更新），所以会“循环”执行。
3. 空依赖数组（即 useEffect(() => { ... }, [])）：
4. 只在组件首次挂载时执行一次。

没有依赖数组，所以每次组件渲染都会执行。如果组件只渲染一次，就只执行一次；如果有状态更新导致多次渲染，就会多次执行。