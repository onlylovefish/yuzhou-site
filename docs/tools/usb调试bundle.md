---
title: usb调试bundle
createTime: 2025/10/21 23:50
permalink: /article/usb调试bundle/

---

## usb调试bundle

下载对应的调试app（不同公司有不同的方式）

安装adb

```bash
sudo brew install --cask android-platform-tools // 安装adb
```
手机打开开发者模式（不同 手机开启方式不一样），设置->开发者选项，打开use调试

开启之后在电脑终端输入adb devices -l,看到连接设备

手动映射
```bash
adb reverse tcp:8081 tcp:8081 //单个设备直接映射
```
然后在bundle调试host设置中设置127.0.0.1:端口号直接连接

## v8 trace调试
使用谷歌浏览器 ```chrome://inspect/#devices```,手机需要通过usb连接到电脑
