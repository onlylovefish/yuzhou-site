---
title: reconciler运作流程
createTime: 2025/08/31 17:16:00
permalink: /article/i6270cum/
---

reconciler包的主要作用

1. 输入：暴露api函数（如：scheduleUpdateOnFiber），供其他包用
2. 注册调度任务：与调度中心（scheduler包）交互，注册调度任务task，等待任务回到
3. 执行任务回调：在内存中构造出fiber树，同时与渲染器(react-dom)交互、在内存中创建出与fiber对应的dom节点
4. 输出：与渲染器(react-dom)交互，渲染dom节点

![alt text](./img/react-reconciler运作流程.png)
上图是一个固定流程，每次更新都会运行

1. 输入：scheduleUpdateOnFiber

由 React（如 setState、dispatchAction 等）触发，调度 Fiber 更新。
主要做标记和调度，不直接构造 Fiber。
2. ensureRootIsScheduled

确保当前 FiberRoot 有任务被调度到 Scheduler。
 注册调度任务，等待执行。
3. workLoop（performUnitOfWork）

Scheduler 执行回调，进入 Fiber 构建流程。
包括 beginWork、completeWork，循环构建 Fiber 树。
具体执行路径有同步（renderRootSync）和并发（renderRootConcurrent）两种。
4. commitRoot

Fiber 树构建完成后，进入提交阶段，输出到 react-dom。

## 输入
只要是需要触发 React 更新流程的操作（即会导致组件重新渲染），最终都会走到 scheduleUpdateOnFiber。但像 Fiber 的创建、销毁、遍历、effect 处理等操作，并不会直接调用这个函数。是所有触发 React 更新流程的入口，比如 ```setState/useState/useReducer/forceUpdate``` 等，最终都会调度到这里。
```js
export function scheduleUpdateOnFiber(
  root: FiberRoot,
  fiber: Fiber,
  lane: Lane,
) {
  // 1. 开发环境下的警告
  if (__DEV__) {
    if (isRunningInsertionEffect) {
      console.error('useInsertionEffect must not schedule updates.');
    }
    if (isFlushingPassiveEffects) {
      didScheduleUpdateDuringPassiveEffects = true;
    }
  }

  // 2. 如果当前 work loop 处于挂起（等待数据或 action），则重置 stack，准备重新渲染
  if (
    (root === workInProgressRoot &&
      (workInProgressSuspendedReason === SuspendedOnData ||
        workInProgressSuspendedReason === SuspendedOnAction)) ||
    root.cancelPendingCommit !== null
  ) {
    prepareFreshStack(root, NoLanes);
    const didAttemptEntireTree = false;
    markRootSuspended(
      root,
      workInProgressRootRenderLanes,
      workInProgressDeferredLane,
      didAttemptEntireTree,
    );
  }

  // 3. 标记 root 有新的更新
  markRootUpdated(root, lane);

  // 4. 判断当前是否在 render phase
  if (
    (executionContext & RenderContext) !== NoContext &&
    root === workInProgressRoot
  ) {
    // Render phase 更新（通常是内部机制，不推荐用户代码这样做）
    warnAboutRenderPhaseUpdatesInDEV(fiber);
    workInProgressRootRenderPhaseUpdatedLanes = mergeLanes(
      workInProgressRootRenderPhaseUpdatedLanes,
      lane,
    );
  } else {
    // 5. 正常的更新（比如事件触发）
    if (enableUpdaterTracking && isDevToolsPresent) {
      addFiberToLanesMap(root, fiber, lane);
    }
    warnIfUpdatesNotWrappedWithActDEV(fiber);

    // 6. 处理 transition tracing（如果启用）
    if (enableTransitionTracing) {
      const transition = ReactSharedInternals.T;
      if (transition !== null && transition.name != null) {
        if (transition.startTime === -1) {
          transition.startTime = now();
        }
        addTransitionToLanesMap(root, transition, lane);
      }
    }

    // 7. 如果 root 正在渲染，标记 interleaved 更新
    if (root === workInProgressRoot) {
      if ((executionContext & RenderContext) === NoContext) {
        workInProgressRootInterleavedUpdatedLanes = mergeLanes(
          workInProgressRootInterleavedUpdatedLanes,
          lane,
        );
      }
      if (workInProgressRootExitStatus === RootSuspendedWithDelay) {
        const didAttemptEntireTree = false;
        markRootSuspended(
          root,
          workInProgressRootRenderLanes,
          workInProgressDeferredLane,
          didAttemptEntireTree,
        );
      }
    }

    // 8. 确保 root 被调度
    ensureRootIsScheduled(root);

    // 9. 如果是同步更新（SyncLane），且是 legacy 模式，则立即刷新
    if (
      lane === SyncLane &&
      executionContext === NoContext &&
      !disableLegacyMode &&
      (fiber.mode & ConcurrentMode) === NoMode
    ) {
      if (__DEV__ && ReactSharedInternals.isBatchingLegacy) {
        // act 测试环境特殊处理
      } else {
        resetRenderTimer();
        flushSyncWorkOnLegacyRootsOnly();
      }
    }
  }
}
```
## 注册调度任务
主要功能

1. 加入调度队列
如果当前 root 没有在调度队列里，就把它加入（通过链表管理多个 root）。

2. 标记有待处理的同步任务
设置 mightHavePendingSyncWork = true，表示有可能有同步任务需要处理。

3. 确保调度任务已注册
调用 ensureScheduleIsScheduled()，保证有微任务或调度任务会在事件循环后处理这些 root 的更新。

4. 测试环境特殊处理
在开发和测试环境下，做一些特殊标记（比如 act 测试相关）。
```js
export function ensureRootIsScheduled(root: FiberRoot): void {
  // This function is called whenever a root receives an update. It does two
  // things 1) it ensures the root is in the root schedule, and 2) it ensures
  // there's a pending microtask to process the root schedule.
  //
  // Most of the actual scheduling logic does not happen until
  // `scheduleTaskForRootDuringMicrotask` runs.

  // Add the root to the schedule
  if (root === lastScheduledRoot || root.next !== null) {
    // Fast path. This root is already scheduled.
  } else {
    if (lastScheduledRoot === null) {
      firstScheduledRoot = lastScheduledRoot = root;
    } else {
      lastScheduledRoot.next = root;
      lastScheduledRoot = root;
    }
  }

  // Any time a root received an update, we set this to true until the next time
  // we process the schedule. If it's false, then we can quickly exit flushSync
  // without consulting the schedule.
  mightHavePendingSyncWork = true;

  ensureScheduleIsScheduled();

  if (
    __DEV__ &&
    !disableLegacyMode &&
    ReactSharedInternals.isBatchingLegacy &&
    root.tag === LegacyRoot
  ) {
    // Special `act` case: Record whenever a legacy update is scheduled.
    ReactSharedInternals.didScheduleLegacyUpdate = true;
  }
}
```

## 执行回调
在上述任务注册后，加入调度队列，随后会去调用performWorkOnRoot
```js
// 注册任务
ensureRootIsScheduled(root) {
  // ...加入调度队列...
  ensureScheduleIsScheduled(); // 注册调度任务
}

// 注册的任务内容
scheduleCallback(priority, () => {
  // ...最终会调用...
  performWorkOnRoot(root, lanes, forceSync);
});
```

可以看到上面的调用```ensureRootIsScheduled```，该函数内部会调用```ensureScheduleIsScheduled```,最终会用 scheduleCallback 注册一个调度任务（比如微任务或宏任务）。
```js
function scheduleImmediateRootScheduleTask() {
  if (__DEV__ && ReactSharedInternals.actQueue !== null) {
    // Special case: Inside an `act` scope, we push microtasks to the fake `act`
    // callback queue. This is because we currently support calling `act`
    // without awaiting the result. The plan is to deprecate that, and require
    // that you always await the result so that the microtasks have a chance to
    // run. But it hasn't happened yet.
    ReactSharedInternals.actQueue.push(() => {
      processRootScheduleInMicrotask();
      return null;
    });
  }

  // TODO: Can we land supportsMicrotasks? Which environments don't support it?
  // Alternatively, can we move this check to the host config?
  if (supportsMicrotasks) {
    scheduleMicrotask(() => {
      // In Safari, appending an iframe forces microtasks to run.
      // https://github.com/facebook/react/issues/22459
      // We don't support running callbacks in the middle of render
      // or commit so we need to check against that.
      const executionContext = getExecutionContext();
      if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
        // Note that this would still prematurely flush the callbacks
        // if this happens outside render or commit phase (e.g. in an event).

        // Intentionally using a macrotask instead of a microtask here. This is
        // wrong semantically but it prevents an infinite loop. The bug is
        // Safari's, not ours, so we just do our best to not crash even though
        // the behavior isn't completely correct.
        Scheduler_scheduleCallback(
          ImmediateSchedulerPriority,
          processRootScheduleInImmediateTask,
        );
        return;
      }
      processRootScheduleInMicrotask();
    });
  } else {
    // If microtasks are not supported, use Scheduler.
    Scheduler_scheduleCallback(
      ImmediateSchedulerPriority,
      processRootScheduleInImmediateTask,
    );
  }
}
```
上面函数中Scheduler_scheduleCallback，scheduleCallback 实际就是调用 Scheduler_scheduleCallback（或者在测试环境下用 actQueue）。

当 Scheduler 认为可以执行时（比如浏览器空闲、优先级满足等），会回调执行任务，这个任务的内容就是调用 performWorkOnRoot(root, lanes, forceSync)。

performWorkOnRoot 会根据优先级选择同步或并发的 work loop，开始遍历和构建 Fiber 树，完成渲染和提交。


接着往```processRootScheduleInImmediateTask```追踪实现，可以发现
```js
const newCallbackNode = scheduleCallback(
      schedulerPriorityLevel,
      performWorkOnRootViaSchedulerTask.bind(null, root),
    );
```
而```performWorkOnRootViaSchedulerTask```最终会调用```performWorkOnRoot(root, lanes, forceSync);```

performWorkOnRoot主要为了Fiber树的构造，错误处理，以及调用输出

输出走到```finishConcurrentRender```

## 输出

该部分调用的是commitRoot，
```js
function commitRoot(
  root: FiberRoot,
  finishedWork: null | Fiber,
  lanes: Lanes,
  recoverableErrors: null | Array<CapturedValue<mixed>>,
  transitions: Array<Transition> | null,
  didIncludeRenderPhaseUpdate: boolean,
  spawnedLane: Lane,
  updatedLanes: Lanes,
  suspendedRetryLanes: Lanes,
  exitStatus: RootExitStatus,
  suspendedCommitReason: SuspendedCommitReason, // Profiling-only
  completedRenderStartTime: number, // Profiling-only
  completedRenderEndTime: number, // Profiling-only
)
```

主要流程如下
1. 执行 mutation（如 DOM 节点插入/删除/属性变更）
2. 执行 layout effects（如 useLayoutEffect）
3. 执行 passive effects（如 useEffect）
4. 处理错误、调度后续任务等