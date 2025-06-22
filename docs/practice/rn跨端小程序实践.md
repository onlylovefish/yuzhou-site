---
title: rn跨端小程序实践
createTime: 2025/06/22 16:41:07
permalink: /article/ohh1otyc/
---

笔者团队之前业务主要在美团app、点评中，调研发现很多用户其实只使用小程序，为了能够扩展业务，获取更多增量，能够投入更多渠道，基于此，鉴于h5兼容性好，我们计划选型h5，从而能够投产更多渠道。那问题就变成了，如何实现这套h5选型

于是我们有两种方案

| 方案编号 | 方案名称         | 优势             | 劣势       |
| ------- | --------------- | ------------------ | ------------------ |
| 1       | 直接开发一套 H5 | 可以做一些重构，代码比较清晰，便于单独维护   | 存在两套代码，开发成本较高
| 2       | RN 跨端         | 一套代码，多端部署，快速迭代，易于推广，多处接入 | 仓库中很多兼容写法，未来维护需要更加细心，发布等方面需要考虑也多


考虑到实际落地，当前公司基建，以及公司的一些实践，最终我们采取了方案2，再基于此，我们可以细化当前的方案，需要再分为两步骤
1. 当前的rn代码需要支持跨端
2. 交互、UI兼容


跨端也就是一套代码，支持多端部署，我们先了解下当前的跨端方案，我们公司主要使用的是max（基于[rax](https://rax.js.org/docs/guide/about)的内部实现），基于此技术组有对应的迁移工具，我们通过迁移工具，首先将我们的代码将其能够支持跨端

## 简单了解下rax跨端的实现原理
Rax 跨端的本质是组件和 API 抽象 + 多端渲染引擎 + 编译时/运行时适配，让你用一套代码，经过工具链编译后可以在 Web、小程序、Weex 等多个平台无缝运行。

组件抽象、渲染器、多端适配等核心源码重点目录：
```js
packages/rax/src：核心组件实现
packages/rax-app：应用框架和多端适配
packages/miniapp-renderer：小程序渲染器
```

多端适配中，通过通过不同平台暴露的createElement来创建，在 Web 端，Rax 会用 driver-dom，把虚拟节点渲染成真实的 DOM 元素。在小程序端，会用 driver-miniapp，渲染成小程序组件。在 Weex 或 RN 端，会用对应的 driver。

## h5小程序的集成
小程序容器-> `<web-view>` 组件->Max生成的h5页面->业务功能实现，公司的小程序中会给每个业务包一个通用的h5 webView，通过在通用路径上拼接对应的业务路由即可

## 本地调试
web侧的调试比较好用的是搭配whistle，调试代理可以见笔者的[whistle调试介绍](./whistle调试介绍.md)

## 混编
有些web和rn侧的实现不能一套代码写，所以在跨端下需要使用混编
```js
| -- max-native
    |-- index.tsx
| -- web-native
    |-- MapView
    |   |-- index.tsx
| -- mrn-native    
    |-- MapView
    |   |-- index.tsx
    
    index.tsx

// index文件中
import {MapView as WebMapView} from './web-native/MapView'
import {MapView as rnMapView} from './rn-native/MapView'

const MapView =(props)=>{
    return <>
        <WebMapView/>
        <RnMapView/>
    </>
}
export default memo(MapView)
```


## 解决页面间的通信
因为我们的页面存在从A->B->C，有些交互需要发送通知，在RN侧，消息通信借助了native的一些桥能力 ，但是在web侧没有桥的概念，所以我们在web侧通过localStorage来进行兼容，为了对外暴露一致，而不至于在每个使用的地方进行<code>isWeb?xx:xx</code>这样的判断，我们对该功能做了混编
```js
// rn侧
const publish=(action,data)=>{
// 对应使用公司一般的api即可
}
const subscribe=(action,handle:(data)=>void)=>{

}

// web侧
const publish=(action,data)=>{
    setStorage({
        key:action,
        data:{
            saveTime:Data.now(),
            expire:600*1000,
            ...data
        }
    })
}
const subscribe=(action,handle:(data)=>void)=>{
    const event=getStorageSync(action)
    const {saveTime,expire,...data}=event||{}
    const now=new Date()
    // 取出后就清除
    removeStorage({key:action})
    if(now-saveTime<=expire){
        // 没有过期，采纳
        for(const key in data){
            if(data[key]==undefined||data[key]==null){
                delete data[key]
            }
        }
        handle({data})
    }
    return data
}
```

## 页面入参获取
因为一些基建原因，我们选择history模式，而不是hash模式的方式作为页面的地址，所以我们有些参数拼接在跳链上需要做统一获取

## 部署发布

## 一些性能有好
因为实际业务中我们通常有很多地方要去获取一些参数，比如SystemInfo，用户的id，token，经纬度等等，而参数的获取需要调用一些基础函数，如果每次使用都重新调用，会有一些性能损耗，所以比较好的方式，我们可以对这些函数做一层缓存
```js
type PromiseFn<T>=(...args:any[])=>Promise<T>
export const memorizePromise<T extends PromiseFn<any>>=(fn:T)=>{
    const wrapper=(...args:any[]):ReturnType<T>=>{
        let cachePromise=ReturnType<T>|undefined
        if(cachePromise){
            return cachePromize
        }
        cachePromise=fn(...args) as ReturnType<T>
        Promise.resolve(cachePromise).catch(e=>{
            cachePromise=undefined
        })
        return cachePromise
    }
    wrapper.clear=()=>{
        cachePromise=undefined
    }
    return wrapper
}
```


## 监控、运维等设置
