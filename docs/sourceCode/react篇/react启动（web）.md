---
title: react启动（web）
createTime: 2025/08/17 17:16:46
permalink: /article/3ms1v8p0/
---
## 启动模式
react启动模式共有3种

1. Legacy(同步)模式，<=17使用ReactDOM.render
```js
// LegacyRoot
ReactDOM.render(<App />, document.getElementById('root'), (dom) => {}); // 支持callback回调, 参数是一个dom对象
```
2. Blocking（阻塞/交互式）模式，18默认，使用ReactDOM.createRoot,兼容旧代码并支持部分并发特性
```js
// BlockingRoot
// 1. 创建ReactDOMRoot对象
const reactDOMBlockingRoot = ReactDOM.createBlockingRoot(
  document.getElementById('root'),
);
// 2. 调用render
reactDOMBlockingRoot.render(<App />); // 不支持回调
```
3. Concurrent（并发）
```js
// ConcurrentRoot
// 1. 创建ReactDOMRoot对象
const reactDOMRoot = ReactDOM.createRoot(document.getElementById('root'));
// 2. 调用render
reactDOMRoot.render(<App />); // 不支持回调
```

## 启动流程
在调用入口函数后，reactElement和dom对象关联

## 创建全局对象
三种启动模式下，react初始化会创建3个全局对象
1. ReactDOMRoot对象
该包在react-dom包，该对象暴露有render,unmount方法，通过调用该实例的render方法，引导创建

2. fiberRoot对象
fiber对象在react-reconciler，保存fiber构建过程中所依赖的全局状态

3. HostRootFiber对象
属于react-reconciler包，这个是react应用中的第一个fiber对象，是Fiber树的根节点，节点类型是HostRoot


![alt text](./img/全局对象创建流程.png)

## 创建ReactDOM（Blocking）Root对象
由于 3 种模式启动的 api 有所不同, 所以从源码上追踪, 也对应了 3 种方式. 最终都 new 一个ReactDOMRoot或ReactDOMBlockingRoot的实例, 需要创建过程中RootTag参数, 3 种模式各不相同. 该RootTag的类型决定了整个 react 应用是否支持可中断渲染(后文有解释).

### legacy模式
```js
ReactDOM.render
```
然后调用legacyRenderSubtreeInfoContainer，初次调用，初次挂载，else则是root已经更新
```js
function legacyRenderSubtreeIntoContainer(
  parentComponent: ?React$Component<any, any>,
  children: ReactNodeList,
  container: Container,
  forceHydrate: boolean,
  callback: ?Function,
): React$Component<any, any> | PublicInstance | null {

  const maybeRoot = container._reactRootContainer;
  let root: FiberRoot;
  if (!maybeRoot) {
    // Initial mount
    root = legacyCreateRootFromDOMContainer(
      container,
      children,
      parentComponent,
      callback,
      forceHydrate,
    );
  } else {
    // root已经初始化，二次调用render会进入
    root = maybeRoot;
    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function () {
        const instance = getPublicRootInstance(root);
        originalCallback.call(instance);
      };
    }
    // Update
    updateContainer(children, root, parentComponent, callback);
  }
  return getPublicRootInstance(root);
}
```
继续往下分析，初次挂载会调用legacyCreateRootFromDOMContainer，实际的如下
```js
function legacyCreateRootFromDOMContainer(
  container: Container,
  initialChildren: ReactNodeList,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
  isHydrationContainer: boolean,
): FiberRoot {
    // SSR场景
    /**
     * 当前页面Html在服务端生成并发送到浏览器，前端react需要接管这部分已有的dom，而
     * 不是重新渲染
     * react会尝试复用和绑定这些dom，而不是清空后重新渲染
     */
  if (isHydrationContainer) {
    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function () {
        const instance = getPublicRootInstance(root);
        originalCallback.call(instance);
      };
    }

    const root: FiberRoot = createHydrationContainer(
      initialChildren,
      callback,
      container,
      LegacyRoot,
      null, // hydrationCallbacks
      false, // isStrictMode
      false, // concurrentUpdatesByDefaultOverride,
      '', // identifierPrefix
      wwwOnUncaughtError,
      wwwOnCaughtError,
      noopOnRecoverableError,
      noopOnDefaultTransitionIndicator,
      // TODO(luna) Support hydration later
      null,
      null,
    );
    container._reactRootContainer = root;
    markContainerAsRoot(root.current, container);

    const rootContainerElement =
      !disableCommentsAsDOMContainers && container.nodeType === COMMENT_NODE
        ? container.parentNode
        : container;
    // $FlowFixMe[incompatible-call]
    listenToAllSupportedEvents(rootContainerElement);

    flushSyncWork();
    return root;
  } else {
    // 不是SSR，则清空container内容，重新渲染
    // First clear any existing content.
    clearContainer(container);

    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function () {
        const instance = getPublicRootInstance(root);
        originalCallback.call(instance);
      };
    }

    const root = createContainer(
      container,
      LegacyRoot,
      null, // hydrationCallbacks
      false, // isStrictMode
      false, // concurrentUpdatesByDefaultOverride,
      '', // identifierPrefix
      wwwOnUncaughtError,
      wwwOnCaughtError,
      noopOnRecoverableError,
      noopOnDefaultTransitionIndicator,
      null, // transitionCallbacks
    );
    container._reactRootContainer = root;
    markContainerAsRoot(root.current, container);

    const rootContainerElement =
      !disableCommentsAsDOMContainers && container.nodeType === COMMENT_NODE
        ? container.parentNode
        : container;
    // $FlowFixMe[incompatible-call]
    listenToAllSupportedEvents(rootContainerElement);

    // Initial mount should not be batched.
    updateContainerSync(initialChildren, root, parentComponent, callback);
    flushSyncWork();

    return root;
  }
}
```

## Concurrent 模式和 Blocking 模式
> Blocking后来也废弃了

1. 分别调用ReactDOM.createRoot和ReactDOM.createBlockingRoot创建ReactDOMRoot和ReactDOMBlockingRoot实例
2. 调用ReactDOMRoot和ReactDOMBlockingRoot实例的render方法

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

  if (options !== null && options !== undefined) {
    
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }
    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }
    if (options.onUncaughtError !== undefined) {
      onUncaughtError = options.onUncaughtError;
    }
    if (options.onCaughtError !== undefined) {
      onCaughtError = options.onCaughtError;
    }
    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }
    if (enableDefaultTransitionIndicator) {
      if (options.onDefaultTransitionIndicator !== undefined) {
        onDefaultTransitionIndicator = options.onDefaultTransitionIndicator;
      }
    }
    if (options.unstable_transitionCallbacks !== undefined) {
      transitionCallbacks = options.unstable_transitionCallbacks;
    }
  }

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

```


```js
// $FlowFixMe[missing-this-annot]
function ReactDOMRoot(internalRoot: FiberRoot) {
    // 创建一个fiberRoot对象, 并将其挂载到this._internalRoot之上
  this._internalRoot = internalRoot;
}

// $FlowFixMe[prop-missing] found when upgrading Flow
ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render =
  // $FlowFixMe[missing-this-annot]
  function (children: ReactNodeList): void {
    const root = this._internalRoot;
    if (root === null) {
      throw new Error('Cannot update an unmounted root.');
    }
    // 执行更新
       updateContainer(children, root, null, null);
  };

  // $FlowFixMe[prop-missing] found when upgrading Flow
ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount =
  // $FlowFixMe[missing-this-annot]
  function (): void {
     const root = this._internalRoot;
    if (root !== null) {
      this._internalRoot = null;
      const container = root.containerInfo;
     
       // 执行更新
      updateContainerSync(null, root, null, null);
      flushSyncWork();
      unmarkContainerAsRoot(container);
    }
  };
```

再往下看找道createContainer的定义，实际这里会去创建FiberRoot
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
//   定义createFiberRoot
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

上面流程
1. 调用createRootImpl创建fiberRoot对象, 并将其挂载到this._internalRoot上.
2. 原型上有render和unmount方法, 且内部都会调用updateContainer进行更新.

## 创建 fiberRoot 对象 {#ccreateFiberRoot}

三种模式创建之后都会调用createFiberRoot,在该函数中创建了react应用的首个fiber对象，称为HostRootFiber(fiber.tag=HostRoot)

```js
export function createHostRootFiber(
  tag: RootTag,
  isStrictMode: boolean,
): Fiber {
  let mode;
  if (disableLegacyMode || tag === ConcurrentRoot) {
    mode = ConcurrentMode;
    if (isStrictMode === true) {
      mode |= StrictLegacyMode | StrictEffectsMode;
    }
  } else {
    mode = NoMode;
  }

  if (enableProfilerTimer && isDevToolsPresent) {
    // Always collect profile timings when DevTools are present.
    // This enables DevTools to start capturing timing at any point–
    // Without some nodes in the tree having empty base times.
    mode |= ProfileMode;
  }

  return createFiber(HostRoot, null, null, mode);
}
```
```js
const createFiber = enableObjectFiber
  ? createFiberImplObject
  : createFiberImplClass;

```
fiber树中所有节点的mode都会和HostRootFiber.mode一致

```js
// fiber对象
function createFiberImplObject(
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
): Fiber {
  const fiber: Fiber = {
    // Instance
    // tag, key - defined at the bottom as dynamic properties
    elementType: null,
    type: null,
    stateNode: null,

    // Fiber
    return: null,
    child: null,
    sibling: null,
    index: 0,

    ref: null,
    refCleanup: null,

    // pendingProps - defined at the bottom as dynamic properties
    memoizedProps: null,
    updateQueue: null,
    memoizedState: null,
    dependencies: null,

    // Effects
    flags: NoFlags,
    subtreeFlags: NoFlags,
    deletions: null,

    lanes: NoLanes,
    childLanes: NoLanes,

    alternate: null,

    // dynamic properties at the end for more efficient hermes bytecode
    tag,
    key,
    pendingProps,
    mode,
  };

  if (enableProfilerTimer) {
    fiber.actualDuration = -0;
    fiber.actualStartTime = -1.1;
    fiber.selfBaseDuration = -0;
    fiber.treeBaseDuration = -0;
  }


  return fiber;
}
```


```js
// 类创建
function createFiberImplClass(
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
): Fiber {
  // $FlowFixMe[invalid-constructor]: the shapes are exact here but Flow doesn't like constructors
  return new FiberNode(tag, pendingProps, key, mode);
}

function FiberNode(
  this: $FlowFixMe,
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
) {
  // Instance
  this.tag = tag;
  this.key = key;
  this.elementType = null;
  this.type = null;
  this.stateNode = null;

  // Fiber
  this.return = null;
  this.child = null;
  this.sibling = null;
  this.index = 0;

  this.ref = null;
  this.refCleanup = null;

  this.pendingProps = pendingProps;
  this.memoizedProps = null;
  this.updateQueue = null;
  this.memoizedState = null;
  this.dependencies = null;

  this.mode = mode;

  // Effects
  this.flags = NoFlags;
  this.subtreeFlags = NoFlags;
  this.deletions = null;

  this.lanes = NoLanes;
  this.childLanes = NoLanes;

  this.alternate = null;

  if (enableProfilerTimer) {
    // Note: The following is done to avoid a v8 performance cliff.
    //
    // Initializing the fields below to smis and later updating them with
    // double values will cause Fibers to end up having separate shapes.
    // This behavior/bug has something to do with Object.preventExtension().
    // Fortunately this only impacts DEV builds.
    // Unfortunately it makes React unusably slow for some applications.
    // To work around this, initialize the fields below with doubles.
    //
    // Learn more about this here:
    // https://github.com/facebook/react/issues/14365
    // https://bugs.chromium.org/p/v8/issues/detail?id=8538

    this.actualDuration = -0;
    this.actualStartTime = -1.1;
    this.selfBaseDuration = -0;
    this.treeBaseDuration = -0;
  }

}
```

## 更新

1. legacy模式

```updateContainer(children, root, parentComponent, callback);```通过updateContainer则串联了react-dom和react-reconciler
```js
// packages/react-reconciler/src/ReactFiberReconciler.js
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

update实现
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

  const root = enqueueUpdate(rootFiber, update, lane);
  if (root !== null) {
    startUpdateTimerByLane(lane, 'root.render()');
    // 3. 进入reconciler运作流程中的`输入`环节,该函数实现见
    // packages/react-reconciler/src/ReactFiberWorkLoop.js
    scheduleUpdateOnFiber(root, rootFiber, lane);
    entangleTransitions(root, rootFiber, lane);
  }
}
```

## 补充
是的，React 的可中断渲染（Interruptible Rendering），是 React 18 并发特性（Concurrent Mode）的核心能力之一。

可中断渲染是什么？

在 legacy 模式下，React 渲染和更新是同步的，主线程会被完全占用，直到渲染结束，无法响应用户操作。

在并发模式（Concurrent Mode）下，React 的调度器可以将渲染任务拆分成多个小块，遇到高优先级任务（如用户输入、动画）时，可以中断当前渲染，先处理高优先级任务，之后再恢复渲染。

这样可以显著提升页面的响应性和流畅度，避免“卡死”或“掉帧”。

典型场景

大量数据渲染时，用户依然可以滚动、点击、输入，不会卡死页面。

动画、输入、网络响应等高优先级任务可以优先执行。
相关 API

ReactDOM.createRoot 默认启用并发渲染。

startTransition 可以手动标记低优先级任务，让 React 自动调度。