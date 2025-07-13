---
title: context原理
createTime: 2025/07/13 17:03:56
permalink: /article/g91t3ax0/
---

我们通常会使用context来保存一些全局变量，用于所有组件共享，放置的变量一般是不常变化的变量

这部分源码见[context](https://github.com/facebook/react/blob/v17.0.2/packages/react/src/ReactContext.js#L14-L152)
```js

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {REACT_CONSUMER_TYPE, REACT_CONTEXT_TYPE} from 'shared/ReactSymbols';

import type {ReactContext} from 'shared/ReactTypes';

export function createContext<T>(defaultValue: T): ReactContext<T> {
  // TODO: Second argument used to be an optional `calculateChangedBits`
  // function. Warn to reserve for future use?

  const context: ReactContext<T> = {
    $$typeof: REACT_CONTEXT_TYPE,
    // As a workaround to support multiple concurrent renderers, we categorize
    // some renderers as primary and others as secondary. We only expect
    // there to be two concurrent renderers at most: React Native (primary) and
    // Fabric (secondary); React DOM (primary) and React ART (secondary).
    // Secondary renderers store their context values on separate fields.
    _currentValue: defaultValue,
    _currentValue2: defaultValue,
    // Used to track how many concurrent renderers this context currently
    // supports within in a single renderer. Such as parallel server rendering.
    _threadCount: 0,
    // These are circular
    Provider: (null: any),
    Consumer: (null: any),
  };

  context.Provider = context;
  context.Consumer = {
    $$typeof: REACT_CONSUMER_TYPE,
    _context: context,
  };
  if (__DEV__) {
    context._currentRenderer = null;
    context._currentRenderer2 = null;
  }

  return context;
}
```

## 核心逻辑
初始值保存在```context._currentRenderer```，同时也保存在```context._currentRenderer2```,一份初始值保留在两个value的目的是为了支持多个渲染器并发渲染，同时还创建了```context.Provider```,```context.Consumer```2个reactElement对象

我们会这样使用
```js
const MyContext=React.createContext(defaultValue)
// 
<MyContext.Provider value={}>
    {/* 子组件 */}
</MyContext.Provider>
```
React.createContext(defaultValue) 创建一个 Context 对象。
<MyContext.Provider value={...}> 提供 context 的值，包裹需要访问该值的组件。
子组件可以通过 useContext(MyContext) 或 <MyContext.Consumer> 获取 value。

在fiber树渲染时，在beginWork中contextProvider类型的节点对应的处理函数是updateContextProvider

这边备注下，每个节点都会经过beginWork，来知道怎么处理和生成子节点，处理完成后，进入completeWork阶段，做收尾和副作用收集

```js
beginWork(
    current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null{
    // 省略无用
    case ContextProvider:
      return updateContextProvider(current, workInProgress, renderLanes);
      // ...
}

function updateContextProvider(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
) {
  const context: ReactContext<any> = workInProgress.type;
  const newProps = workInProgress.pendingProps;
    //  接收新值
  const newValue = newProps.value;

  if (__DEV__) {
    if (!('value' in newProps)) {
      if (!hasWarnedAboutUsingNoValuePropOnContextProvider) {
        hasWarnedAboutUsingNoValuePropOnContextProvider = true;
        console.error(
          'The `value` prop is required for the `<Context.Provider>`. Did you misspell it or forget to pass it?',
        );
      }
    }
  }
// 这里更新ContextProvier._currentValue
  pushProvider(workInProgress, context, newValue);

  const newChildren = newProps.children;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}

```
updateContextProvider()在fiber初次创建时十分简单, 仅仅就是保存了pendingProps.value做为context的最新值, 之后这个最新的值用于供给消费.

## context._currentValue存储
pushProvider实际上是一个存储函数, 利用栈的特性, 先把context._currentValue压栈, 之后更新context._currentValue = nextValue.

与pushProvider对应的还有popProvider，同样是利用栈的特性，把栈中的值弹出，还原到context._currentValue

### pushProvider
```js
export function pushProvider<T>(
  providerFiber: Fiber,
  context: ReactContext<T>,
  nextValue: T,
): void {
  if (isPrimaryRenderer) {
    push(valueCursor, context._currentValue, providerFiber);

    context._currentValue = nextValue;
    if (__DEV__) {
      push(rendererCursorDEV, context._currentRenderer, providerFiber);

      if (
        context._currentRenderer !== undefined &&
        context._currentRenderer !== null &&
        context._currentRenderer !== rendererSigil
      ) {
        console.error(
          'Detected multiple renderers concurrently rendering the ' +
            'same context provider. This is currently unsupported.',
        );
      }
      context._currentRenderer = rendererSigil;
    }
  } else {
    push(valueCursor, context._currentValue2, providerFiber);

    context._currentValue2 = nextValue;
    if (__DEV__) {
      push(renderer2CursorDEV, context._currentRenderer2, providerFiber);

      if (
        context._currentRenderer2 !== undefined &&
        context._currentRenderer2 !== null &&
        context._currentRenderer2 !== rendererSigil
      ) {
        console.error(
          'Detected multiple renderers concurrently rendering the ' +
            'same context provider. This is currently unsupported.',
        );
      }
      context._currentRenderer2 = rendererSigil;
    }
  }
}
```
### popProvider
```js
export function popProvider(
  context: ReactContext<any>,
  providerFiber: Fiber,
): void {
  const currentValue = valueCursor.current;

  if (isPrimaryRenderer) {
    context._currentValue = currentValue;
    if (__DEV__) {
      const currentRenderer = rendererCursorDEV.current;
      pop(rendererCursorDEV, providerFiber);
      context._currentRenderer = currentRenderer;
    }
  } else {
    context._currentValue2 = currentValue;
    if (__DEV__) {
      const currentRenderer2 = renderer2CursorDEV.current;
      pop(renderer2CursorDEV, providerFiber);
      context._currentRenderer2 = currentRenderer2;
    }
  }

  pop(valueCursor, providerFiber);
}

```
### push/pop函数
```js

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactInternalTypes';

export type StackCursor<T> = {current: T};

const valueStack: Array<any> = [];

let fiberStack: Array<Fiber | null>;

if (__DEV__) {
  fiberStack = [];
}

let index = -1;

function createCursor<T>(defaultValue: T): StackCursor<T> {
  return {
    current: defaultValue,
  };
}

function pop<T>(cursor: StackCursor<T>, fiber: Fiber): void {
  if (index < 0) {
    if (__DEV__) {
      console.error('Unexpected pop.');
    }
    return;
  }

  if (__DEV__) {
    if (fiber !== fiberStack[index]) {
      console.error('Unexpected Fiber popped.');
    }
  }

  cursor.current = valueStack[index];

  valueStack[index] = null;

  if (__DEV__) {
    fiberStack[index] = null;
  }

  index--;
}

function push<T>(cursor: StackCursor<T>, value: T, fiber: Fiber): void {
  index++;

  valueStack[index] = cursor.current;

  if (__DEV__) {
    fiberStack[index] = fiber;
  }

  cursor.current = value;
}
export {createCursor, pop, push};

```

## 消费Context
使用了MyContext.Provider组件之后，在fiber树构造中，context的值会被ContextProvider类型的Filber节点所更新
在react中，有三种方式消费Context
1. 使用```MyContext.Consumber```组件，用于JSX，```<MyContext.Consumer>(value)=>{}</MyContext.Consumer>```

beginWork中，对于ContextConsumber类型的节点，对应的处理函数是updateContextConsumber
```js
function updateContextConsumer(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
) {
  const consumerType: ReactConsumerType<any> = workInProgress.type;
  const context: ReactContext<any> = consumerType._context;
  const newProps = workInProgress.pendingProps;
  const render = newProps.children;

  prepareToReadContext(workInProgress, renderLanes);
  const newValue = readContext(context);
  if (enableSchedulingProfiler) {
    markComponentRenderStarted(workInProgress);
  }
  let newChildren;
  if (__DEV__) {
    newChildren = callComponentInDEV(render, newValue, undefined);
  } else {
    newChildren = render(newValue);
  }
  if (enableSchedulingProfiler) {
    markComponentRenderStopped();
  }

  // React DevTools reads this flag.
  workInProgress.flags |= PerformedWork;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}
```

2. 使用useContext，用于function中，如```const value = useContext(MyContext)```

- 进入updateFunctionComponent后，会调用prepareToReadContext
- 无论是初次创建阶段，还是更新阶段，useContext都直接调用了readContext
```js
function beginWork(){
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
}
```

3. class组件中，使用一个静态属性contextType，用于class组件中获取context，如```MyClass.contextType = MyContext;```
- 进入```updateClassComponent```后, 会调用```prepareToReadContext```
- 无论```constructClassInstance,mountClassInstance, updateClassInstance```内部都调用```context = readContext((contextType: any));```

上述三类方式都是react根据不同使用场景封装的api,内部都会调用```prepareToReadContext```和```readContext(contextType)```

```js
export function prepareToReadContext(
  workInProgress: Fiber,
  renderLanes: Lanes,
): void {
    // 设置全局变量，为读readContext做准备
  currentlyRenderingFiber = workInProgress;
  lastContextDependency = null;

  const dependencies = workInProgress.dependencies;
  if (dependencies !== null) {
    // Reset the work-in-progress list
    dependencies.firstContext = null;
  }
}
```
```js
export function readContext<T>(context: ReactContext<T>): T {
  if (__DEV__) {
    // This warning would fire if you read context inside a Hook like useMemo.
    // Unlike the class check below, it's not enforced in production for perf.
    if (isDisallowedContextReadInDEV) {
      console.error(
        'Context can only be read while React is rendering. ' +
          'In classes, you can read it in the render method or getDerivedStateFromProps. ' +
          'In function components, you can read it directly in the function body, but not ' +
          'inside Hooks like useReducer() or useMemo().',
      );
    }
  }
  return readContextForConsumer(currentlyRenderingFiber, context);
}
```
实际read中调用的readContextForConsumer
```js
function readContextForConsumer<T>(
  consumer: Fiber | null,
  context: ReactContext<T>,
): T {
    // 根据当前渲染器类型，从context._currentValue或者context._currentValue2取值
    // 并把依赖链挂到Fiber节点上，方便后续Context变更时出触发更新
  const value = isPrimaryRenderer
    ? context._currentValue
    : context._currentValue2;

  const contextItem = {
    context: ((context: any): ReactContext<mixed>),
    memoizedValue: value,
    next: null,
  };

/**
 * 构造一个contextItem，加入到workInProgress.dependecies链表之后
 */
  if (lastContextDependency === null) {
    if (consumer === null) {
      throw new Error(
        'Context can only be read while React is rendering. ' +
          'In classes, you can read it in the render method or getDerivedStateFromProps. ' +
          'In function components, you can read it directly in the function body, but not ' +
          'inside Hooks like useReducer() or useMemo().',
      );
    }

    // This is the first dependency for this component. Create a new list.
    lastContextDependency = contextItem;
    consumer.dependencies = __DEV__
      ? {
          lanes: NoLanes,
          firstContext: contextItem,
          _debugThenableState: null,
        }
      : {
          lanes: NoLanes,
          firstContext: contextItem,
        };
    consumer.flags |= NeedsPropagation;
  } else {
    // Append a new context item.
    lastContextDependency = lastContextDependency.next = contextItem;
  }
  return value;
}
```

dependencies 记录了当前组件（Fiber 节点）依赖了哪些 Context。
每次调用 readContextForConsumer 时，都会把依赖的 Context 及其当前值（memoizedValue）挂到链表上。

这样做的目的是：当 Context 的值发生变化时，React 能快速找到所有依赖该 Context 的组件，并触发它们重新渲染。

## 更新context
react18相比react17移除了calculateChangeBits相关Api，context更新更简单，直接对比value是否变化，

Bailout 逻辑和 Consumer 标记更新的流程被简化，主要依赖 Fiber 的 lanes 和调度机制。
现在的 updateContextProvider 只负责更新 value 和递归处理子节点，具体的 Consumer 更新由调度系统和依赖链表自动完成。直接走reconcileChildren方法
```js
function updateContextProvider(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
) {
  const context: ReactContext<any> = workInProgress.type;
  const newProps = workInProgress.pendingProps;
  const newValue = newProps.value;

// 省略无关代码
  const newChildren = newProps.children;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}

```

## 总结
1. Context 是个“值栈”
React Context 的底层实现确实用了“栈”结构（pushProvider/popProvider），
这样可以支持 Provider 的嵌套（比如父 Provider 和子 Provider 的值隔离），每进入一个 Provider 就压栈，离开就弹栈，还原上层值。

2. 为什么 Context 更新要依赖 Fiber？
Fiber 是 React 的“工作单元”，每个组件实例对应一个 Fiber 节点。
当你消费 Context（比如 useContext），React 会把“我依赖了哪个 Context”挂到当前 Fiber 节点的 dependencies 属性上。
这样做的目的是：只有依赖了某个 Context 的 Fiber 节点，才需要在 Context 更新时被重新渲染。
React 通过 Fiber 的依赖链，精准找到需要更新的组件，避免全量刷新，提高性能。

3. 为什么不用全局通知？
如果不用 Fiber 记录依赖，Context 更新时只能全局通知所有组件，性能很差。
Fiber 让 React 能“按需更新”，只刷新真正依赖 Context 的组件。