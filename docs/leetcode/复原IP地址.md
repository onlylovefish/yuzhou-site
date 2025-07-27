---
title: 复原IP地址
createTime: 2025/07/27 21:09:33
permalink: /article/ybszyby4/
---
```js
/**
 * @param {string} s
 * @return {string[]}
 */
var restoreIpAddresses = function(s) {
    const SEG_COUNT=4
    const segments=new Array(SEG_COUNT)
    const ans=[]
    const dfs=(segId,segStart,s)=>{
        // 找到了4段IP地址并且遍历完了字符串，那么就是一种答案
        if(segId==SEG_COUNT){
            if(segStart==s.length){
                ans.push(segments.join('.'))
                console.log(ans,'**')
            }
            return
        }

        // 如果还没有找到4段IP地址，就已经遍历完了，那么提前回溯
        if(segStart==s.length){
            return
        }

        // 不能有前导0,如果当前数字是0，那他就单独作为一个
        if(s.charAt(segStart)=='0'){
            segments[segId]=0
            dfs(segId+1,segStart+1,s)
            return
        }

        // 一般情况
        let addr=0
        for(let segEnd=segStart;segEnd<s.length;++segEnd){
            addr=addr*10+(s.charAt(segEnd)-'0')
            if(addr>0&&addr<=0xff){
                segments[segId]=addr
                dfs(segId+1,segEnd+1,s)
            }else{
                break
            }
        }
    }
    dfs(0,0,s)
    console.log(ans)
    return ans
};
```