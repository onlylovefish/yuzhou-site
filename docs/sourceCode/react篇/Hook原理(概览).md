---
title: Hook原理(概览)
createTime: 2025/11/09 22:45:49
permalink: /article/tvsfsua8/
---

## 为什么引入hook（动机）
在组件之间复用状态逻辑很难; 复杂组件变得难以理解; 难以理解的 class. 为了解决这些实际开发痛点, 引入了Hook.

## Hook是什么，什么时候用hook
hook是一个特殊的函数，可以钩入React的特性，如useState是在react函数组建中添加state的hook，主要在函数式组件中使用，如果在函数组件中想要添加一些state，以前的做法必须要将其转化为class，现在可以通过hook

## hook会因为渲染时创建函数而变慢吗
不会，React 中每次渲染函数组件时，组件函数（包括 hook 相关的 useState、useEffect、useCallback 等）都会被重新执行。这意味着在渲染时会“重新创建”函数作用域，但这只是 JavaScript 的正常执行过程，性能开销极小

相比类组件，函数组件（使用 Hook）在渲染时“创建函数”并不会导致变慢，反而通常会更快或更高效。原因如下：

类组件每次渲染时会复用同一个实例，但方法会绑定 this，且 state 更新和生命周期管理更复杂，存在额外的性能开销。

函数组件每次渲染就是一次普通的函数调用，React 内部优化了 Hook 的执行流程，避免了不必要的对象创建和复杂的原型链查找。

现代 React（如 React 18）对函数组件和 Hook 做了大量优化，批量更新、并发渲染等新特性都优先支持函数组件。

符合语言习惯的代码在使用 Hook 时不需要很深的组件树嵌套. 这个现象在使用高阶组件、render props、和 context 的代码库中非常普遍. 组件树小了, React 的工作量也随之减少.

## hook数据结构

主要文件见```ReactFiberHooks.js```
```js
export type Hook = {
  memoizedState: any,
  baseState: any,
  baseQueue: Update<any, any> | null,
  queue: any,
  next: Hook | null,
};
// hook 对象结构
{
  memoizedState, // 当前 hook 的 state 或 effect 链表头
  baseState,     // useState/useReducer 的基础 state
  baseQueue,     // useState/useReducer 的基础更新队列
  queue,         // 更新队列（useState/useReducer）或 effect 队列（useEffect）
  next           // 指向下一个 hook
}
export type Effect = {
  tag: HookFlags,
  inst: EffectInstance,
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
  next: Effect,
};
// effect 对象结构（链表节点）
{
  tag,      // effect 类型（如 HookPassive、HookLayout）
  create,   // 副作用函数
  destroy,  // 清理函数
  deps,     // 依赖数组
  next      // 指向下一个 effect（环形链表）
}
```

## Hook分类
```js
// Unwind Circular: moved from ReactFiberHooks.old
export type HookType =
  | 'useState'
  | 'useReducer'
  | 'useContext'
  | 'useRef'
  | 'useEffect'
  | 'useEffectEvent'
  | 'useInsertionEffect'
  | 'useLayoutEffect'
  | 'useCallback'
  | 'useMemo'
  | 'useImperativeHandle'
  | 'useDebugValue'
  | 'useDeferredValue'
  | 'useTransition'
  | 'useSyncExternalStore'
  | 'useId'
  | 'useCacheRefresh'
  | 'useOptimistic'
  | 'useFormState'
  | 'useActionState';
```

Hook分为两类，状态hook(state hook)和副作用Hook(effect hook)

## 状态hook
狭义上讲，```useState```,```useReducer```可以在function组件添加内部state，且```useState```实际上是```useReducer```的简易封装，是一个最特殊的useReducer，所以将useState, useReducer称为状态Hook.

广义上讲，只要能实现数据持久化且没有副作用的hook，即为状态hook，所以还包括useContext, useRef, useCallback, useMemo等. 这类Hook内部没有使用useState/useReducer, 但是它们也能实现多次render时, 保持其初始值不变(即数据持久化)且没有任何副作用.

为什么能够实现数据持久化，得益于双缓冲技术,在多次render时, 以fiber为载体, 保证复用同一个Hook对象


## 副作用Hook
副作用Hook则会修改fiber.flags

## 组合hook
官网并无组合Hook的说法, 但事实上大多数Hook(包括自定义Hook)都是由上述 2 种 Hook组合而成, 同时拥有这 2 种 Hook 的特性.平时开发中, 自定义Hook大部分都是组合 Hook.


## 调用Function前

### 全局变量
```js
// These are set right before calling the component.
// // 渲染优先级
let renderLanes: Lanes = NoLanes;
// The work-in-progress fiber. I've named it differently to distinguish it from
// the work-in-progress hook.
// 当前正在构造的fiber, 等同于 workInProgress, 为了和当前hook区分, 所以将其改名
let currentlyRenderingFiber: Fiber = (null: any);

// Hooks are stored as a linked list on the fiber's memoizedState field. The
// current hook list is the list that belongs to the current fiber. The
// work-in-progress hook list is a new list that will be added to the
// work-in-progress fiber.
// Hooks被存储在fiber.memoizedState 链表上
let currentHook: Hook | null = null;
let workInProgressHook: Hook | null = null;

// Whether an update was scheduled at any point during the render phase. This
// does not get reset if we do another render pass; only when we're completely
// finished evaluating this component. This is an optimization so we know
// whether we need to clear render phase updates after a throw.
let didScheduleRenderPhaseUpdate: boolean = false;
// Where an update was scheduled only during the current render pass. This
// gets reset after each attempt.
// TODO: Maybe there's some way to consolidate this with
// `didScheduleRenderPhaseUpdate`. Or with `numberOfReRenders`.
let didScheduleRenderPhaseUpdateDuringThisPass: boolean = false;
let shouldDoubleInvokeUserFnsInHooksDEV: boolean = false;
// Counts the number of useId hooks in this component.
let localIdCounter: number = 0;
// Counts number of `use`-d thenables
let thenableIndexCounter: number = 0;
let thenableState: ThenableState | null = null;

// Used for ids that are generated completely client-side (i.e. not during
// hydration). This counter is global, so client ids are not stable across
// render attempts.
let globalClientIdCounter: number = 0;

const RE_RENDER_LIMIT = 25;
```

### renderWithHooks
```js
export function renderWithHooks<Props, SecondArg>(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: (p: Props, arg: SecondArg) => any,
  props: Props,
  secondArg: SecondArg,
  nextRenderLanes: Lanes,
): any {
  renderLanes = nextRenderLanes;
  currentlyRenderingFiber = workInProgress;

  if (__DEV__) {
    hookTypesDev =
      current !== null
        ? ((current._debugHookTypes: any): Array<HookType>)
        : null;
    hookTypesUpdateIndexDev = -1;
    // Used for hot reloading:
    ignorePreviousDependencies =
      current !== null && current.type !== workInProgress.type;

    warnIfAsyncClientComponent(Component);
  }

  workInProgress.memoizedState = null;
  workInProgress.updateQueue = null;
  workInProgress.lanes = NoLanes;

  // The following should have already been reset
  // currentHook = null;
  // workInProgressHook = null;

  // didScheduleRenderPhaseUpdate = false;
  // localIdCounter = 0;
  // thenableIndexCounter = 0;
  // thenableState = null;

  // TODO Warn if no hooks are used at all during mount, then some are used during update.
  // Currently we will identify the update render as a mount because memoizedState === null.
  // This is tricky because it's valid for certain types of components (e.g. React.lazy)

  // Using memoizedState to differentiate between mount/update only works if at least one stateful hook is used.
  // Non-stateful hooks (e.g. context) don't get added to memoizedState,
  // so memoizedState would be null during updates and mounts.
  if (__DEV__) {
    if (current !== null && current.memoizedState !== null) {
      ReactSharedInternals.H = HooksDispatcherOnUpdateInDEV;
    } else if (hookTypesDev !== null) {
      // This dispatcher handles an edge case where a component is updating,
      // but no stateful hooks have been used.
      // We want to match the production code behavior (which will use HooksDispatcherOnMount),
      // but with the extra DEV validation to ensure hooks ordering hasn't changed.
      // This dispatcher does that.
      ReactSharedInternals.H = HooksDispatcherOnMountWithHookTypesInDEV;
    } else {
      ReactSharedInternals.H = HooksDispatcherOnMountInDEV;
    }
  } else {
    ReactSharedInternals.H =
      current === null || current.memoizedState === null
        ? HooksDispatcherOnMount
        : HooksDispatcherOnUpdate;
  }

  // In Strict Mode, during development, user functions are double invoked to
  // help detect side effects. The logic for how this is implemented for in
  // hook components is a bit complex so let's break it down.
  //
  // We will invoke the entire component function twice. However, during the
  // second invocation of the component, the hook state from the first
  // invocation will be reused. That means things like `useMemo` functions won't
  // run again, because the deps will match and the memoized result will
  // be reused.
  //
  // We want memoized functions to run twice, too, so account for this, user
  // functions are double invoked during the *first* invocation of the component
  // function, and are *not* double invoked during the second incovation:
  //
  // - First execution of component function: user functions are double invoked
  // - Second execution of component function (in Strict Mode, during
  //   development): user functions are not double invoked.
  //
  // This is intentional for a few reasons; most importantly, it's because of
  // how `use` works when something suspends: it reuses the promise that was
  // passed during the first attempt. This is itself a form of memoization.
  // We need to be able to memoize the reactive inputs to the `use` call using
  // a hook (i.e. `useMemo`), which means, the reactive inputs to `use` must
  // come from the same component invocation as the output.
  //
  // There are plenty of tests to ensure this behavior is correct.
  const shouldDoubleRenderDEV =
    __DEV__ && (workInProgress.mode & StrictLegacyMode) !== NoMode;

  shouldDoubleInvokeUserFnsInHooksDEV = shouldDoubleRenderDEV;
  let children = __DEV__
    ? callComponentInDEV(Component, props, secondArg)
    : Component(props, secondArg);
  shouldDoubleInvokeUserFnsInHooksDEV = false;

  // Check if there was a render phase update
  if (didScheduleRenderPhaseUpdateDuringThisPass) {
    // Keep rendering until the component stabilizes (there are no more render
    // phase updates).
    children = renderWithHooksAgain(
      workInProgress,
      Component,
      props,
      secondArg,
    );
  }

  if (shouldDoubleRenderDEV) {
    // In development, components are invoked twice to help detect side effects.
    setIsStrictModeForDevtools(true);
    try {
      children = renderWithHooksAgain(
        workInProgress,
        Component,
        props,
        secondArg,
      );
    } finally {
      setIsStrictModeForDevtools(false);
    }
  }

  finishRenderingHooks(current, workInProgress, Component);

  return children;
}
```