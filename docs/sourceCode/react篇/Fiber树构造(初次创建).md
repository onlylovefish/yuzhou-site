---
title: Fiber树构造(初次创建)
createTime: 2025/10/05 17:07:43
permalink: /article/nwezsmfk/
---
Fiber树创建示例demo
```js
class App extends React.Component {
  componentDidMount() {
    console.log(`App Mount`);
    console.log(`App 组件对应的fiber节点: `, this._reactInternals);
  }
  render() {
    return (
      <div className="app">
        <header>header</header>
        <Content />
      </div>
    );
  }
}

class Content extends React.Component {
  componentDidMount() {
    console.log(`Content Mount`);
    console.log(`Content 组件对应的fiber节点: `, this._reactInternals);
  }
  render() {
    return (
      <React.Fragment>
        <p>1</p>
        <p>2</p>
      </React.Fragment>
    );
  }
}
export default App;
```

# 启动阶段
React 应用启动流程是：入口挂载 → 创建 FiberRoot/HostRootFiber → render 触发 update → 构建 update 对象 → 入队调度 → 构建 Fiber 树 → commit → 页面渲染完成。每一步在源码中都有对应实现，核心在于 Fiber 架构和调度机制。

创建FiberRoot和HostRootFiber->调用render，触发update流程->创建update对象->入队并调度->Fiber树构造(reconciler)->commit->页面渲染，完成


我们可以看到一个react项目index.js文件,初始会调用createRoot，对应的即createContainer
```js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
console.log(document.getElementById('root'),'root');
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

对应[createRoot](https://github.com/facebook/react/blob/main/packages/react-dom/client.js)如下
```js
export function createRoot(
  container: Element | Document | DocumentFragment,
  options?: CreateRootOptions,
): RootType {
  if (!isValidContainer(container)) {
    throw new Error('Target container is not a DOM element.');
  }

  warnIfReactDOMContainerInDEV(container);

  const concurrentUpdatesByDefaultOverride = false;
  let isStrictMode = false;
  let identifierPrefix = '';
  let onUncaughtError = defaultOnUncaughtError;
  let onCaughtError = defaultOnCaughtError;
  let onRecoverableError = defaultOnRecoverableError;
  let onDefaultTransitionIndicator = defaultOnDefaultTransitionIndicator;
  let transitionCallbacks = null;
    // ...省略无关代码
  const root = createContainer(
    container,
    ConcurrentRoot,
    null,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onUncaughtError,
    onCaughtError,
    onRecoverableError,
    onDefaultTransitionIndicator,
    transitionCallbacks,
  );
  markContainerAsRoot(root.current, container);

  const rootContainerElement: Document | Element | DocumentFragment =
    !disableCommentsAsDOMContainers && container.nodeType === COMMENT_NODE
      ? (container.parentNode: any)
      : container;
  listenToAllSupportedEvents(rootContainerElement);

  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  return new ReactDOMRoot(root);
}

// $FlowFixMe[missing-this-annot]
function ReactDOMRoot(internalRoot: FiberRoot) {
  this._internalRoot = internalRoot;
}
```

createContainer源码如下,所以此处实际开始进入的是Fiber树构造
```js
export function createContainer(
  containerInfo: Container,
  tag: RootTag,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
  isStrictMode: boolean,
  // TODO: Remove `concurrentUpdatesByDefaultOverride`. It is now ignored.
  concurrentUpdatesByDefaultOverride: null | boolean,
  identifierPrefix: string,
  onUncaughtError: (
    error: mixed,
    errorInfo: {+componentStack?: ?string},
  ) => void,
  onCaughtError: (
    error: mixed,
    errorInfo: {
      +componentStack?: ?string,
      +errorBoundary?: ?React$Component<any, any>,
    },
  ) => void,
  onRecoverableError: (
    error: mixed,
    errorInfo: {+componentStack?: ?string},
  ) => void,
  onDefaultTransitionIndicator: () => void | (() => void),
  transitionCallbacks: null | TransitionTracingCallbacks,
): OpaqueRoot {
  const hydrate = false;
  const initialChildren = null;
  const root = createFiberRoot(
    containerInfo,
    tag,
    hydrate,
    initialChildren,
    hydrationCallbacks,
    isStrictMode,
    identifierPrefix,
    null,
    onUncaughtError,
    onCaughtError,
    onRecoverableError,
    onDefaultTransitionIndicator,
    transitionCallbacks,
  );
  registerDefaultIndicator(onDefaultTransitionIndicator);
  return root;
}
```

再回到代码中，刚刚讨论的是createRoot，现在我们看下render实际做了什么,```root.render```会将更新任务加入到调度队列，触发调度流程。相关源码在 ```react-reconciler/src/ReactFiberWorkLoop.js```
[Reconciliation](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberReconciler.js)

## 创建update对象
```root.render```调用[updateContainer](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberReconciler.js#L315)，创建后，内存结构会变为如下
![alt text](./img/Fiber树构造启动阶段2.png)
```js
export function updateContainer(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): Lane {
  const current = container.current;
  const lane = requestUpdateLane(current);
  updateContainerImpl(
    current,
    lane,
    element,
    container,
    parentComponent,
    callback,
  );
  return lane;
}
```

updateContainerImpl的实现
```js
function updateContainerImpl(
  rootFiber: Fiber,
  lane: Lane,
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): void {
 

  if (enableSchedulingProfiler) {
    markRenderScheduled(lane);
  }

  const context = getContextForSubtree(parentComponent);
  if (container.context === null) {
    container.context = context;
  } else {
    container.pendingContext = context;
  }

 
// 2. 设置fiber.updateQueue
  const update = createUpdate(lane);
  // Caution: React DevTools currently depends on this property
  // being called "element".
  update.payload = {element};

  callback = callback === undefined ? null : callback;
  if (callback !== null) {
   
    update.callback = callback;
  }
// 加入update对象
  const root = enqueueUpdate(rootFiber, update, lane);
  if (root !== null) {
    startUpdateTimerByLane(lane, 'root.render()');
    scheduleUpdateOnFiber(root, rootFiber, lane);
    entangleTransitions(root, rootFiber, lane);
  }
}
```

## 构造阶段
上一步后如果```root!==null```则会进行scheduleUpdateOnFiber,该函数的内容很多，初次渲染主要为下面部分，（注legacy模式，也就是ReactDOM.render(<App/>,root)）
![](./img/构造过程中HostRoot.png)

```js
 if (
      lane === SyncLane &&
      executionContext === NoContext &&
      !disableLegacyMode &&
      (fiber.mode & ConcurrentMode) === NoMode
    ) {
      if (__DEV__ && ReactSharedInternals.isBatchingLegacy) {
        // Treat `act` as if it's inside `batchedUpdates`, even in legacy mode.
      } else {
        // Flush the synchronous work now, unless we're already working or inside
        // a batch. This is intentionally inside scheduleUpdateOnFiber instead of
        // scheduleCallbackForFiber to preserve the ability to schedule a callback
        // without immediately flushing it. We only do this for user-initiated
        // updates, to preserve historical behavior of legacy mode.
        resetRenderTimer();
        flushSyncWorkOnLegacyRootsOnly();
      }
    }
```

在补充一个关于legacy模式和concurrent、blocking模式
1. legacy通过```ReactDOM.render(<App/>,rootDOM)```,采用同步渲染机制，一旦开始渲染，就会持续执行直到完成，期间无法被中断。如果渲染任务耗时较长，就会阻塞浏览器主线程，导致页面卡顿，无法响应
```js
// LegacyRoot
ReactDOM.render(<App />, document.getElementById('root'), (dom) => {}); // 支持callback回调, 参数是一个dom对象
```
2. Blocking，通过```ReactDOM.createBlockingRoot(rootNode).render(<App />)```，启动，但未完全启用并发，是legacy到concurrent模式的过渡，支持部分并发，允许渲染过程中被高优先级任务（如用户输入）中断，但中断后会重新开始整个渲染过程（而不是继续之前的进度），支持suspense用于代码分割，不支持useTransition等
```js
// BlockingRoot
// 1. 创建ReactDOMRoot对象
const reactDOMBlockingRoot = ReactDOM.createBlockingRoot(
  document.getElementById('root'),
);
// 2. 调用render
reactDOMBlockingRoot.render(<App />); // 不支持回调
```
3. concurrent，并发模式```ReactDOM.createRoot(rootNode).render(<App />)```,采用异步渲染，支持渲染中断、暂停、恢复，放弃等

```js
// ConcurrentRoot
// 1. 创建ReactDOMRoot对象
const reactDOMRoot = ReactDOM.createRoot(document.getElementById('root'));
// 2. 调用render
reactDOMRoot.render(<App />); // 不支持回调
```

在```scheduleUpdateOnFiber```后走到```performSyncWorkOnRoot```
```js
function performSyncWorkOnRoot(root: FiberRoot, lanes: Lanes) {
  // This is the entry point for synchronous tasks that don't go
  // through Scheduler.
  const didFlushPassiveEffects = flushPendingEffects();
  if (didFlushPassiveEffects) {
    // If passive effects were flushed, exit to the outer work loop in the root
    // scheduler, so we can recompute the priority.
    return null;
  }
  if (enableProfilerTimer && enableProfilerNestedUpdatePhase) {
    syncNestedUpdateFlag();
  }
  const forceSync = true;
  performWorkOnRoot(root, lanes, forceSync);
}
```
继续看```performWorkOnRoot```，会看到```renderRootSync```,部分代码如下
```js
function renderRootSync(root: FiberRoot, lanes: Lanes) {
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  // 如果fiberRoot变动, 或者update.lane变动, 都会刷新栈帧, 丢弃上一次渲染进度
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    // 刷新栈帧, legacy模式下都会进入
    prepareFreshStack(root, lanes);
  }
  do {
    try {
      workLoopSync();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
  executionContext = prevExecutionContext;
  // 重置全局变量, 表明render结束
  workInProgressRoot = null;
  workInProgressRootRenderLanes = NoLanes;
  return workInProgressRootExitStatus;
}
```
在```renderRootSync```中，执行fiber构造(workLoopSync)前，会根据当前的情况进行判断，If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off，这里应该就是并发模式可以恢复栈帧的逻辑，刷新栈帧```prepareFreshStack```,重置全局变量workInProgress和workInProgressRoot等
![alt text](./img/workLoop内存状态.png)

这里有看到一种没见过的写法,所以特此记录一下
```js
/**
 * ,outer: 是一个标签（label），可以给后面的循环或代码块命名。do { ... }    while (true); 是一个 do-while 循环。
 在循环体内部，可以用 break outer; 或 continue outer; 跳出或继续这个带标签的循环。
 */
outer: do {
  // ...
  if (something) break outer;
  // ...
} while (true);
```

### 循环构造
```js
function workLoopSync() {
  // Perform work without checking if we need to yield between fiber.
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}
/**
 * 相比workLoopSync的模式，多了一个停顿机制，实现切片，可中断渲染
 */
function workLoopConcurrent(nonIdle: boolean) {
  // We yield every other "frame" when rendering Transition or Retries. Those are blocking
  // revealing new content. The purpose of this yield is not to avoid the overhead of yielding,
  // which is very low, but rather to intentionally block any frequently occuring other main
  // thread work like animations from starving our work. In other words, the purpose of this
  // is to reduce the framerate of animations to 30 frames per second.
  // For Idle work we yield every 5ms to keep animations going smooth.
  if (workInProgress !== null) {
    const yieldAfter = now() + (nonIdle ? 25 : 5);
    do {
      // $FlowFixMe[incompatible-call] flow doesn't know that now() is side-effect free
      performUnitOfWork(workInProgress);
    } while (workInProgress !== null && now() < yieldAfter);
  }
}
```
继续查看```performUnitOfWork```
```js
function performUnitOfWork(unitOfWork: Fiber): void {
  // The current, flushed, state of this fiber is the alternate. Ideally
  // nothing should rely on this, but relying on it here means that we don't
  // need an additional field on the work in progress.
  // unitOfWork就是被传入的workInProgress
  const current = unitOfWork.alternate;

  let next;
  if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);
    if (__DEV__) {
      next = runWithFiberInDEV(
        unitOfWork,
        beginWork,
        current,
        unitOfWork,
        entangledRenderLanes,
      );
    } else {
      next = beginWork(current, unitOfWork, entangledRenderLanes);
    }
    stopProfilerTimerIfRunningAndRecordDuration(unitOfWork);
  } else {
    if (__DEV__) {
      next = runWithFiberInDEV(
        unitOfWork,
        beginWork,
        current,
        unitOfWork,
        entangledRenderLanes,
      );
    } else {
      next = beginWork(current, unitOfWork, entangledRenderLanes);
    }
  }

  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
}
```
workInProgress（正在处理中的fiber节点）不停的往下next，整个fiber树构造事一个深度优先遍历
![](./img/Fiber树构造过程1.png)

- workInProgress和current视为双指针
- workInProgress指向当前正在构造的fiber节点
- current=workInProgress.alternate(fiber.alternate)指向当前页面正在使用的fiber节点，初次构造时，页面还未渲染，此时current=null

在深度优先遍历中，每个fiber节点经历两个阶段，这两个阶段共同完成每个fiber节点的创建，所有fiber节点构成fiber树
1. 探寻beginWork
2. 回溯completeWork

### beginWork（探寻阶段）
[beginWork](https://github.com/facebook/react/blob/c78625842239f29ff130136fff2729fd4c7c2e91/packages/react-reconciler/src/ReactFiberBeginWork.js#L4091)针对所有的fiber类型,通过switch workInProgress的tag，进行不同的update处理,主要逻辑如下
1. 根据ReactElement对象创建所有的fiber节点，最终构造出fiber树形结构(设置return和sibling指针)
2. 设置fiber.flags(二进制形式变量, 用来标记 fiber节点 的增,删,改状态, 等待completeWork阶段处理)
3. 设置fiber.stateNode局部状态（如Class类型节点: fiber.stateNode=new Class()）

```js
function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {


  if (current !== null) {
   // 非首次渲染，先不管
  } else {
    didReceiveUpdate = false;

    if (getIsHydrating() && isForkedChild(workInProgress)) {
      // Check if this child belongs to a list of muliple children in
      // its parent.
      //
      // In a true multi-threaded implementation, we would render children on
      // parallel threads. This would represent the beginning of a new render
      // thread for this subtree.
      //
      // We only use this for id generation during hydration, which is why the
      // logic is located in this special branch.
      const slotIndex = workInProgress.index;
      const numberOfForks = getForksAtLevel(workInProgress);
      pushTreeId(workInProgress, numberOfForks, slotIndex);
    }
  }
   switch (workInProgress.tag) {
    case LazyComponent: {
      const elementType = workInProgress.elementType;
      return mountLazyComponent(
        current,
        workInProgress,
        elementType,
        renderLanes,
      );
    }
    case FunctionComponent: {
      const Component = workInProgress.type;
      return updateFunctionComponent(
        current,
        workInProgress,
        Component,
        workInProgress.pendingProps,
        renderLanes,
      );
    }
    case ClassComponent: {
      const Component = workInProgress.type;
      const unresolvedProps = workInProgress.pendingProps;
      const resolvedProps = resolveClassComponentProps(
        Component,
        unresolvedProps,
      );
      return updateClassComponent(
        current,
        workInProgress,
        Component,
        resolvedProps,
        renderLanes,
      );
    }
    // ...
  ```

  updateXXX函数逻辑主要为3个步骤，总的目的是为了向下生成子节点，在这个过程将一些需要持久化的数据挂载到fiber节点上,(如fiber.stateNode,fiber.memoizedState等); 把fiber节点的特殊操作设置到fiber.flags(如:节点ref,class组件的生命周期,function组件的hook,节点删除等).


  1. 根据```fiber.pendingProps,fiber.updateQueue```等输入数据状态，计算```fiber.memoizedState```作为输出状态
  2. 获取下级ReactElement对象
  3. 根据ReactElement对象调用reconcileChild生成Fiber子节点

