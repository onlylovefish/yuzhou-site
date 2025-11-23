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



commitRoot中```finishedWork```指的是本次渲染完成后生成的 Fiber 树的根节点，也就是“工作完成的 Fiber 树”的根（通常是 HostRoot Fiber）。它代表了 React 本轮更新后要提交（commit）到 DOM 或宿主环境的最新 Fiber 树。

- 在渲染（render）阶段，React 会以当前 Fiber 树为基础，构建一棵新的 workInProgress Fiber 树。
- 渲染完成后，这棵新的 Fiber 树的根节点就是 finishedWork。
- 进入 commit 阶段时，commitRoot 会以 finishedWork 为入口，遍历整棵树，执行副作用（如 DOM 更新、生命周期回调等），并最终将 root.current 指向这棵新的树。



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
): void {
  root.cancelPendingCommit = null;

  do {
    // `flushPassiveEffects` will call `flushSyncUpdateQueue` at the end, which
    // means `flushPassiveEffects` will sometimes result in additional
    // passive effects. So we need to keep flushing in a loop until there are
    // no more pending effects.
    // TODO: Might be better if `flushPassiveEffects` did not automatically
    // flush synchronous work at the end, to avoid factoring hazards like this.
    flushPendingEffects();
  } while (pendingEffectsStatus !== NO_PENDING_EFFECTS);

    // 如果没有更新的
    if (finishedWork === null) {
        return
    }

     if (finishedWork === root.current) {
    throw new Error(
      'Cannot commit the same tree as before. This error is likely caused by ' +
        'a bug in React. Please file an issue.',
    );
  }


  // Check which lanes no longer have any work scheduled on them, and mark
  // those as finished.
  let remainingLanes = mergeLanes(finishedWork.lanes, finishedWork.childLanes);

  // Make sure to account for lanes that were updated by a concurrent event
  // during the render phase; don't mark them as finished.
  const concurrentlyUpdatedLanes = getConcurrentlyUpdatedLanes();
  remainingLanes = mergeLanes(remainingLanes, concurrentlyUpdatedLanes);

  if (enableGestureTransition && root.pendingGestures === null) {
    // Gestures don't clear their lanes while the gesture is still active but it
    // might not be scheduled to do any more renders and so we shouldn't schedule
    // any more gesture lane work until a new gesture is scheduled.
    remainingLanes &= ~GestureLane;
  }

/**
 * 标记本次 commit 后，哪些 lanes（优先级/任务）已经完成，哪些还剩下需要处理。
 */
  markRootFinished(
    root,
    lanes,
    remainingLanes,
    spawnedLane,
    updatedLanes,
    suspendedRetryLanes,
  );

    // Reset this before firing side effects so we can detect recursive updates.
  didIncludeCommitPhaseUpdate = false;


  if (root === workInProgressRoot) {
    // We can reset these now that they are finished.
    workInProgressRoot = null;
    workInProgress = null;
    workInProgressRootRenderLanes = NoLanes;
  } else {
    // This indicates that the last root we worked on is not the same one that
    // we're committing now. This most commonly happens when a suspended root
    // times out.
  }

    // workInProgressX might be overwritten, so we want
  // to store it in pendingPassiveX until they get processed
  // We need to pass this through as an argument to commitRoot
  // because workInProgressX might have changed between
  // the previous render and commit if we throttle the commit
  // with setTimeout
  pendingFinishedWork = finishedWork;
  pendingEffectsRoot = root;
  pendingEffectsLanes = lanes;
  pendingEffectsRemainingLanes = remainingLanes;
  pendingPassiveTransitions = transitions;
  pendingRecoverableErrors = recoverableErrors;
  pendingDidIncludeRenderPhaseUpdate = didIncludeRenderPhaseUpdate;
 /**
  * 部分代码省略
  */

/**
 * 在 commit 阶段，如果本次渲染有 passive effects（如 useEffect），就安排一个异步任务去执行这些副作用；如果没有，则清理调度信息。
这样可以保证副作用在合适的时机被执行，同时不会重复调度无用任务，提升性能和资源利用率。
 */
  if (
    // If this subtree rendered with profiling this commit, we need to visit it to log it.
    (enableProfilerTimer &&
      enableComponentPerformanceTrack &&
      finishedWork.actualDuration !== 0) ||
    (finishedWork.subtreeFlags & passiveSubtreeMask) !== NoFlags ||
    (finishedWork.flags & passiveSubtreeMask) !== NoFlags
  ) {
    if (enableYieldingBeforePassive) {
      // We don't schedule a separate task for flushing passive effects.
      // Instead, we just rely on ensureRootIsScheduled below to schedule
      // a callback for us to flush the passive effects.
    } else {
      // So we can clear these now to allow a new callback to be scheduled.
      root.callbackNode = null;
      root.callbackPriority = NoLane;
      scheduleCallback(NormalSchedulerPriority, () => {
        if (enableProfilerTimer && enableComponentPerformanceTrack) {
          // Track the currently executing event if there is one so we can ignore this
          // event when logging events.
          trackSchedulerEvent();
        }
        flushPassiveEffects(true);
        // This render triggered passive effects: release the root cache pool
        // *after* passive effects fire to avoid freeing a cache pool that may
        // be referenced by a node in the tree (HostRoot, Cache boundary etc)
        return null;
      });
    }
  } else {
    // If we don't have passive effects, we're not going to need to perform more work
    // so we can clear the callback now.
    root.callbackNode = null;
    root.callbackPriority = NoLane;
  }

    // 部分代码省略

  // The commit phase is broken into several sub-phases. We do a separate pass
  // of the effect list for each phase: all mutation effects come before all
  // layout effects, and so on.

  // Check if there are any effects in the whole tree.
  // TODO: This is left over from the effect list implementation, where we had
  // to check for the existence of `firstEffect` to satisfy Flow. I think the
  // only other reason this optimization exists is because it affects profiling.
  // Reconsider whether this is necessary.
  const subtreeHasBeforeMutationEffects =
    (finishedWork.subtreeFlags & (BeforeMutationMask | MutationMask)) !==
    NoFlags;
  const rootHasBeforeMutationEffect =
    (finishedWork.flags & (BeforeMutationMask | MutationMask)) !== NoFlags;

  if (subtreeHasBeforeMutationEffects || rootHasBeforeMutationEffect) {
    const prevTransition = ReactSharedInternals.T;
    ReactSharedInternals.T = null;
    const previousPriority = getCurrentUpdatePriority();
    setCurrentUpdatePriority(DiscreteEventPriority);
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext;
    try {
      // The first phase a "before mutation" phase. We use this phase to read the
      // state of the host tree right before we mutate it. This is where
      // getSnapshotBeforeUpdate is called.
      commitBeforeMutationEffects(root, finishedWork, lanes);
    } finally {
      // Reset the priority to the previous non-sync value.
      executionContext = prevExecutionContext;
      setCurrentUpdatePriority(previousPriority);
      ReactSharedInternals.T = prevTransition;
    }
  }

   pendingEffectsStatus = PENDING_MUTATION_PHASE;
  if (enableViewTransition && willStartViewTransition) {
    pendingViewTransition = startViewTransition(
      root.containerInfo,
      pendingTransitionTypes,
      flushMutationEffects,
      flushLayoutEffects,
      flushAfterMutationEffects,
      flushSpawnedWork,
      flushPassiveEffects,
      reportViewTransitionError,
    );
  } else {
    /**
     * 精髓处
     */
    // Flush synchronously.
    flushMutationEffects();
    flushLayoutEffects();
    // Skip flushAfterMutationEffects
    flushSpawnedWork();
  }
}
```

### markRootFinished
前面主要处理一些finishedWork的边界情况，通过```markRootFinished```标记本次 commit 后，哪些 lanes（优先级/任务）已经完成，哪些还剩下需要处理。

markRootFinished 是 React 内部用于管理调度和任务优先级的函数。它会根据本次 commit 完成的 lanes（lanes），以及还剩下的 lanes（remainingLanes），更新 root 上的状态。这样，React 就能知道哪些任务已经完成，哪些还需要继续调度和处理，保证后续的调度和更新是正确的。


为什么要这样做？

React 支持多优先级并发调度（Concurrent Mode），同一个 root 可能有多个不同优先级的任务（lanes）。每次 commit 后，需要把已经完成的 lanes 标记为“已完成”，剩下的继续等待下次调度。这样可以避免重复渲染、保证高优先级任务优先完成。


### commitBeforeMutationEffects
```commitBeforeMutationEffects```是React Fiber 渲染流程中 commit 阶段的第一步，遍历 Fiber 树，执行所有“Before Mutation”类型的副作用。递归遍历所有有 BeforeMutation 副作用的 Fiber 节点。对每个节点调用 ```commitBeforeMutationEffectsOnFiber```，根据 tag 和 flags 执行不同的前置副作用,主要典型场景：

1. 调用 class 组件的 getSnapshotBeforeUpdate
2. 处理 useEffectEvent 的 ref impl 切换
3. 处理 ViewTransition、Suspense 等相关的前置逻辑
4. 处理即将被删除节点的相关副作用
```js
export function commitBeforeMutationEffects(
  root: FiberRoot,
  firstChild: Fiber,
  committedLanes: Lanes,
): void {
  focusedInstanceHandle = prepareForCommit(root.containerInfo);
  shouldFireAfterActiveInstanceBlur = false;

  const isViewTransitionEligible =
    enableViewTransition &&
    includesOnlyViewTransitionEligibleLanes(committedLanes);

  nextEffect = firstChild;
  commitBeforeMutationEffects_begin(isViewTransitionEligible);

  // We no longer need to track the active instance fiber
  focusedInstanceHandle = null;
  // We've found any matched pairs and can now reset.
  resetAppearingViewTransitions();
}

function commitBeforeMutationEffects_begin(isViewTransitionEligible: boolean) {
  // If this commit is eligible for a View Transition we look into all mutated subtrees.
  // TODO: We could optimize this by marking these with the Snapshot subtree flag in the render phase.
  const subtreeMask = isViewTransitionEligible
    ? BeforeAndAfterMutationTransitionMask
    : BeforeMutationMask;
  while (nextEffect !== null) {
    const fiber = nextEffect;

    // This phase is only used for beforeActiveInstanceBlur.
    // Let's skip the whole loop if it's off.
    if (enableCreateEventHandleAPI || isViewTransitionEligible) {
      // TODO: Should wrap this in flags check, too, as optimization
      const deletions = fiber.deletions;
      if (deletions !== null) {
        for (let i = 0; i < deletions.length; i++) {
          const deletion = deletions[i];
          commitBeforeMutationEffectsDeletion(
            deletion,
            isViewTransitionEligible,
          );
        }
      }
    }

    if (
      enableViewTransition &&
      fiber.alternate === null &&
      (fiber.flags & Placement) !== NoFlags
    ) {
      // Skip before mutation effects of the children because we don't want
      // to trigger updates of any nested view transitions and we shouldn't
      // have any other before mutation effects since snapshot effects are
      // only applied to updates. TODO: Model this using only flags.
      if (isViewTransitionEligible) {
        trackEnterViewTransitions(fiber);
      }
      commitBeforeMutationEffects_complete(isViewTransitionEligible);
      continue;
    }

    // TODO: This should really unify with the switch in commitBeforeMutationEffectsOnFiber recursively.
    if (enableViewTransition && fiber.tag === OffscreenComponent) {
      const isModernRoot =
        disableLegacyMode || (fiber.mode & ConcurrentMode) !== NoMode;
      if (isModernRoot) {
        const current = fiber.alternate;
        const isHidden = fiber.memoizedState !== null;
        if (isHidden) {
          if (
            current !== null &&
            current.memoizedState === null &&
            isViewTransitionEligible
          ) {
            // Was previously mounted as visible but is now hidden.
            commitExitViewTransitions(current);
          }
          // Skip before mutation effects of the children because they're hidden.
          commitBeforeMutationEffects_complete(isViewTransitionEligible);
          continue;
        } else if (current !== null && current.memoizedState !== null) {
          // Was previously mounted as hidden but is now visible.
          // Skip before mutation effects of the children because we don't want
          // to trigger updates of any nested view transitions and we shouldn't
          // have any other before mutation effects since snapshot effects are
          // only applied to updates. TODO: Model this using only flags.
          if (isViewTransitionEligible) {
            trackEnterViewTransitions(fiber);
          }
          commitBeforeMutationEffects_complete(isViewTransitionEligible);
          continue;
        }
      }
    }

    const child = fiber.child;
    if ((fiber.subtreeFlags & subtreeMask) !== NoFlags && child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      if (isViewTransitionEligible) {
        // We are inside an updated subtree. Any mutations that affected the
        // parent HostInstance's layout or set of children (such as reorders)
        // might have also affected the positioning or size of the inner
        // ViewTransitions. Therefore we need to find them inside.
        commitNestedViewTransitions(fiber);
      }
      commitBeforeMutationEffects_complete(isViewTransitionEligible);
    }
  }
}

function commitBeforeMutationEffects_complete(
  isViewTransitionEligible: boolean,
) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    commitBeforeMutationEffectsOnFiber(fiber, isViewTransitionEligible);

    const sibling = fiber.sibling;
    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

function commitBeforeMutationEffectsOnFiber(
  finishedWork: Fiber,
  isViewTransitionEligible: boolean,
) {
  const current = finishedWork.alternate;
  const flags = finishedWork.flags;

  if (enableCreateEventHandleAPI) {
    if (!shouldFireAfterActiveInstanceBlur && focusedInstanceHandle !== null) {
      // Check to see if the focused element was inside of a hidden (Suspense) subtree.
      // TODO: Move this out of the hot path using a dedicated effect tag.
      // TODO: This should consider Offscreen in general and not just SuspenseComponent.
      if (
        finishedWork.tag === SuspenseComponent &&
        isSuspenseBoundaryBeingHidden(current, finishedWork) &&
        // $FlowFixMe[incompatible-call] found when upgrading Flow
        doesFiberContain(finishedWork, focusedInstanceHandle)
      ) {
        shouldFireAfterActiveInstanceBlur = true;
        beforeActiveInstanceBlur(finishedWork);
      }
    }
  }

  switch (finishedWork.tag) {
    case FunctionComponent: {
      if (enableUseEffectEventHook) {
        if ((flags & Update) !== NoFlags) {
          const updateQueue: FunctionComponentUpdateQueue | null =
            (finishedWork.updateQueue: any);
          const eventPayloads =
            updateQueue !== null ? updateQueue.events : null;
          if (eventPayloads !== null) {
            for (let ii = 0; ii < eventPayloads.length; ii++) {
              const {ref, nextImpl} = eventPayloads[ii];
              ref.impl = nextImpl;
            }
          }
        }
      }
      break;
    }
    case ForwardRef:
    case SimpleMemoComponent: {
      break;
    }
    case ClassComponent: {
      if ((flags & Snapshot) !== NoFlags) {
        if (current !== null) {
          commitClassSnapshot(finishedWork, current);
        }
      }
      break;
    }
    case HostRoot: {
      if ((flags & Snapshot) !== NoFlags) {
        if (supportsMutation) {
          const root = finishedWork.stateNode;
          clearContainer(root.containerInfo);
        }
      }
      break;
    }
    case HostComponent:
    case HostHoistable:
    case HostSingleton:
    case HostText:
    case HostPortal:
    case IncompleteClassComponent:
      // Nothing to do for these component types
      break;
    case ViewTransitionComponent:
      if (enableViewTransition) {
        if (isViewTransitionEligible) {
          // 初次渲染 调用 componentDidMount
          if (current === null) {
            // This is a new mount. We should have handled this as part of the
            // Placement effect or it is deeper inside a entering transition.
          } else {
            // Something may have mutated within this subtree. This might need to cause
            // a cross-fade of this parent. We first assign old names to the
            // previous tree in the before mutation phase in case we need to.
            // TODO: This walks the tree that we might continue walking anyway.
            // We should just stash the parent ViewTransitionComponent and continue
            // walking the tree until we find HostComponent but to do that we need
            // to use a stack which requires refactoring this phase.
            commitBeforeUpdateViewTransition(current, finishedWork);
          }
        }
        break;
      }
    // Fallthrough
    default: {
      if ((flags & Snapshot) !== NoFlags) {
        throw new Error(
          'This unit of work tag should not have side-effects. This error is ' +
            'likely caused by a bug in React. Please file an issue.',
        );
      }
    }
  }
}
```

### flushMutationEffects
```js

function flushMutationEffects(): void {
    // 只有当 pendingEffectsStatus === PENDING_MUTATION_PHASE 时才会执行，防止重复调用。
  if (pendingEffectsStatus !== PENDING_MUTATION_PHASE) {
    return;
  }
  pendingEffectsStatus = NO_PENDING_EFFECTS;

  const root = pendingEffectsRoot;
  const finishedWork = pendingFinishedWork;
  const lanes = pendingEffectsLanes;
  const subtreeMutationHasEffects =
    (finishedWork.subtreeFlags & MutationMask) !== NoFlags;
  const rootMutationHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

  if (subtreeMutationHasEffects || rootMutationHasEffect) {
    const prevTransition = ReactSharedInternals.T;
    ReactSharedInternals.T = null;
    const previousPriority = getCurrentUpdatePriority();
    setCurrentUpdatePriority(DiscreteEventPriority);
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext;
    try {
      // The next phase is the mutation phase, where we mutate the host tree.
      commitMutationEffects(root, finishedWork, lanes);

      if (enableCreateEventHandleAPI) {
        if (shouldFireAfterActiveInstanceBlur) {
          afterActiveInstanceBlur();
        }
      }
      resetAfterCommit(root.containerInfo);
    } finally {
      // Reset the priority to the previous non-sync value.
      executionContext = prevExecutionContext;
      setCurrentUpdatePriority(previousPriority);
      ReactSharedInternals.T = prevTransition;
    }
  }

  // The work-in-progress tree is now the current tree. This must come after
  // the mutation phase, so that the previous tree is still current during
  // componentWillUnmount, but before the layout phase, so that the finished
  // work is current during componentDidMount/Update.
  root.current = finishedWork;
  pendingEffectsStatus = PENDING_LAYOUT_PHASE;
}
```

```flushMutationEffects```在 React commit 阶段的“Mutation Phase”中，遍历 Fiber 树，执行所有需要“变更 DOM”或“副作用”的操作。


#### 详细流程

##### 状态检查
只有当 pendingEffectsStatus === PENDING_MUTATION_PHASE 时才会执行，防止重复调用。

##### 准备变量

1. 获取当前需要处理的 root、finishedWork（即将成为 current 的 Fiber 树）、lanes。

2. 检查本次 commit 是否有 Mutation 类型的副作用（如 Placement、Update、Deletion 等）。

##### 执行 Mutation 副作用

如果有 Mutation 副作用（MutationMask），则：

1. 切换到 CommitContext，提升优先级到 DiscreteEventPriority。
   
2. 调用 commitMutationEffects(root, finishedWork, lanes)，遍历 Fiber 树，执行所有 Mutation 副作用，如：
    
    - 插入/删除/移动 DOM 节点
    - 调用 class 组件的 componentWillUnmount
    - 处理 ref 的 attach/detach
    - 触发 useInsertionEffect

3. 处理事件相关的副作用（如 afterActiveInstanceBlur）。
4. 调用 resetAfterCommit，让宿主环境（如 DOM）做一些收尾工作。

##### 切换 Fiber 树

将 root.current 指向刚刚 commit 完成的 finishedWork，即“切换当前树”。
进入下一个阶段

将 pendingEffectsStatus 设为 PENDING_LAYOUT_PHASE，准备进入 Layout 副作用阶段。

#### commitMutationEffectsOnFiber

```commitMutationEffectsOnFiber```是 ```React Fiber commit``` 阶段“Mutation Phase”最核心的递归函数之一。它的作用是遍历 Fiber 树，对每个 Fiber 节点执行需要的“变更副作用”，比如插入、更新、删除 DOM 节点，解绑 ref，调用卸载生命周期等。该函数每个case中都会先调用```recursivelyTraverseMutationEffects```，主要作用为确保所有子节点的副作用先于父节点执行（自底向上）。

##### 主要流程和作用
1. 递归遍历

首先递归遍历子节点（recursivelyTraverseMutationEffects），确保所有子节点的副作用先于父节点执行（自底向上）。

2. 处理自身副作用
根据 Fiber 的类型（tag），对当前节点执行不同的副作用处理，包括：
    - FunctionComponent / ClassComponent / HostComponent / HostText 等：
        - 递归处理子节点
        - 处理自身的副作用（如 Placement、Update、Ref、ContentReset、FormReset 等）
        - 处理 hooks 的卸载和挂载（如 useEffect、useLayoutEffect 的 unmount/mount）
        - 处理 ref 的解绑和绑定
        - 处理 DOM 节点的插入、更新、删除
        - 处理 class 组件的 componentWillUnmount
        - 处理 Suspense、Offscreen、Portal、Profiler、ViewTransition 等特殊类型的副作用
        - HostRoot：处理根节点相关的副作用，比如 hydration、持久化等。
        - HostPortal：处理 portal 子树的副作用。
        - Suspense/Offscreen：处理隐藏/显示、重置、重连等逻辑。
        - ViewTransitionComponent：处理视图过渡相关的动画和标记。

3. 处理删除（deletion）
如果当前节点有删除的子节点（deletions），会递归调用 commitDeletionEffects，对被删除的 Fiber 及其子树做彻底的副作用清理，包括：
    
    - 卸载副作用
    
    - 解绑 ref
    - 移除 DOM 节点
    - 调用卸载生命周期
    - 断开 Fiber 链表，帮助 GC
4. 性能统计
如果开启了 Profiler，会记录副作用的耗时、错误等信息，便于性能分析和调试。

##### 🌰 以其中```HostComponent```( 即原生 DOM 节点，比如 \<div\>、\<span\> 等 )case类型为例

```js
 case HostComponent: {
        // 递归处理子节点，先递归处理所有子 Fiber，确保子树的副作用先于父节点执行。
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
    //  处理自身的副作用，将新建的 DOM 节点插入到正确的父节点和位置中，这就是“挂载”或“插入”节点的过程。
      commitReconciliationEffects(finishedWork, lanes);

    //  Ref 的解绑，如果有 Ref 变更，先解绑旧的 Ref。
      if (flags & Ref) {
        if (!offscreenSubtreeWasHidden && current !== null) {
          safelyDetachRef(current, current.return);
        }
      }

    //   处理 DOM 相关的变更
      if (supportsMutation) {
        // TODO: ContentReset gets cleared by the children during the commit
        // phase. This is a refactor hazard because it means we must read
        // flags the flags after `commitReconciliationEffects` has already run;
        // the order matters. We should refactor so that ContentReset does not
        // rely on mutating the flag during commit. Like by setting a flag
        // during the render phase instead.
        if (finishedWork.flags & ContentReset) {
            //ContentReset 重置文本内容（如 <input> 的 value）。
          commitHostResetTextContent(finishedWork);
        }

        if (flags & Update) {
            // Update：调用 commitHostUpdate，对比新旧 props，更新 DOM 属性、事件、样式等。
          const instance: Instance = finishedWork.stateNode;
          if (instance != null) {
            // Commit the work prepared earlier.
            // For hydration we reuse the update path but we treat the oldProps
            // as the newProps. The updatePayload will contain the real change in
            // this case.
            const newProps = finishedWork.memoizedProps;
            const oldProps =
              current !== null ? current.memoizedProps : newProps;
            commitHostUpdate(finishedWork, newProps, oldProps);
          }
        }

        if (flags & FormReset) {
            // FormReset：如果是 <form>，记录需要重置，稍后统一处理。
          needsFormReset = true;
          if (__DEV__) {
            if (finishedWork.type !== 'form') {
              // Paranoid coding. In case we accidentally start using the
              // FormReset bit for something else.
              console.error(
                'Unexpected host component type. Expected a form. This is a ' +
                  'bug in React.',
              );
            }
          }
        }
      } else {
        if (enableEagerAlternateStateNodeCleanup) {
          if (supportsPersistence) {
            if (finishedWork.alternate !== null) {
              // `finishedWork.alternate.stateNode` is pointing to a stale shadow
              // node at this point, retaining it and its subtree. To reclaim
              // memory, point `alternate.stateNode` to new shadow node. This
              // prevents shadow node from staying in memory longer than it
              // needs to. The correct behaviour of this is checked by test in
              // React Native: ShadowNodeReferenceCounter-itest.js#L150
              finishedWork.alternate.stateNode = finishedWork.stateNode;
            }
          }
        }
      }
      break;
    }
```

###### ref解绑
<strong>解绑旧的 ref：</strong>

在 commit 阶段的 Mutation Phase，React 会先判断当前 Fiber（如 HostComponent）是否有 Ref 相关的变更（flags & Ref），如果有，并且不是在隐藏的 Offscreen 子树中，就会调用 safelyDetachRef(current, current.return)，解绑旧树（current，也就是上一次渲染的 Fiber 树）上的 ref。

<strong>绑定新的 ref：</strong>

绑定新 ref 的操作不是在 Mutation Phase，而是在后续的 Layout Phase 完成的。
具体来说，在 commitLayoutEffectOnFiber 里，如果有 Ref 相关的变更，会调用 safelyAttachRef(finishedWork, finishedWork.return)，把 ref 绑定到新树（workInProgress，也就是本次渲染完成的 Fiber 树）上。

<strong>新旧树的关系：</strong>

current 指的是旧的 Fiber（上一次 commit 后的树）。
finishedWork 指的是新 Fiber（本次 commit 后要成为 current 的树）。
流程总结：

Mutation Phase：解绑旧树（current）上的 ref。
Layout Phase：绑定新树（finishedWork）上的 ref。
这样保证了 ref 总是指向最新的 DOM 或组件实例。

### dom变更后 commitLayoutEffects
```js
export function commitLayoutEffects(
  finishedWork: Fiber,
  root: FiberRoot,
  committedLanes: Lanes,
): void {
  inProgressLanes = committedLanes;
  inProgressRoot = root;

  resetComponentEffectTimers();

  const current = finishedWork.alternate;
  commitLayoutEffectOnFiber(root, current, finishedWork, committedLanes);

  inProgressLanes = null;
  inProgressRoot = null;
}
```
```commitLayoutEffectOnFiber```,负责在 commit 的 Layout 阶段递归遍历 Fiber 树，执行所有布局相关的副作用。
典型副作用包括：useLayoutEffect、componentDidMount、componentDidUpdate、ref 绑定、自动聚焦等。
只有在 DOM 已经变更后才会执行，保证副作用拿到的 DOM 是最新的。

以FunctionComponent🌰

```js
 case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
    // 首先调用 recursivelyTraverseLayoutEffects，递归处理所有子 Fiber 节点，确保子树的 layout 副作用先于父节点执行。
      recursivelyTraverseLayoutEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
      );
      if (flags & Update) {
        commitHookLayoutEffects(finishedWork, HookLayout | HookHasEffect);
      }
      break;
    }
```
典型场景你在函数组件里写的``` useLayoutEffect(() => { ... }, [...])```，就是在这里被同步执行的。
这保证了 effect 执行时，DOM 已经是最新状态。


#### commitHookLayoutEffects（主要实现在commitHookEffectListMount）
本质就是遍历并执行 function 组件的 hooks 副作用的 create 函数，并把返回的清理函数保存下来，供卸载时调用。举个🌰
```js
useLayoutEffect(() => {
  // 这里的代码会在 commitHookEffectListMount 里被执行
  // 可以安全操作 DOM
  return () => { /* 清理逻辑 */ }
}, []);
```
同理useEffect也会最终在commitHookEffectListMount,只是不同的hook执行的时机不同
```js
export function commitHookEffectListMount(
  flags: HookFlags,
  finishedWork: Fiber,
) {
  try {
    // 从 finishedWork.updateQueue 里拿到 effect 环形链表（lastEffect）
    const updateQueue: FunctionComponentUpdateQueue | null =
      (finishedWork.updateQueue: any);
    const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
    // 如果有 effect，就遍历。以环形链表的方式遍历每一个 effect。
    if (lastEffect !== null) {
      const firstEffect = lastEffect.next;
      let effect = firstEffect;
      do {
        // 只有 effect.tag 包含传入的 flags（如 HookLayout、HookInsertion、HookPassive）才会执行。
        if ((effect.tag & flags) === flags) {

          // Mount
          let destroy;
         /**
          * 省略无关代码
          */
         /**
          * 对于 useLayoutEffect、useInsertionEffect、useEffect，会调用 effect 的 create 方法（即你写的副作用函数）。
返回值（destroy）会被保存到 inst.destroy，用于卸载时调用。
          */
            const create = effect.create;
            const inst = effect.inst;
            destroy = create();
            inst.destroy = destroy;
          
        }
        effect = effect.next;
      } while (effect !== firstEffect);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}
```

### 清理善后flushSpawnedWork

该函数的主要功能为在 React commit 阶段的最后，处理“衍生（spawned）出来的工作”，确保所有特殊的副作用流程都被正确执行和收尾。

