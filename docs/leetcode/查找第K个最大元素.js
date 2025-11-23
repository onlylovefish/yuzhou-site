/**
 * @param {number[]} nums
 * @param {number} k
 * @return {number}
 */
var findKthLargest = function(nums, k) {
    let heapSize = nums.length;
    buildMaxHeap(nums, heapSize); // 构建大顶堆（堆顶是最大值）

    // 执行 k-1 次“堆顶与末尾元素交换 + 堆调整”
    // 每次交换后，堆的最大元素被移到数组末尾，堆大小减 1
    for (let i = nums.length - 1; i >= nums.length - k + 1; --i) {
        swap(nums, 0, i); // 堆顶（当前最大值）与末尾元素交换
        --heapSize;       // 堆大小缩小（排除已确定的最大值）
        maxHeapify(nums, 0, heapSize); // 重新调整堆，维持大顶堆性质
    }

    return nums[0]; // 经过 k-1 次调整后，堆顶就是第 k 大的元素
};

// 构建大顶堆：从最后一个非叶子节点开始，逐个向下调整
const buildMaxHeap = (a, heapSize) => {
    // 最后一个非叶子节点的索引：Math.floor(heapSize/2) - 1
    for (let i = Math.floor(heapSize / 2) - 1; i >= 0; i--) {
        maxHeapify(a, i, heapSize);
    }
};

// 堆调整：将以 i 为根的子树调整为大顶堆
const maxHeapify = (a, i, heapSize) => {
    const l = i * 2 + 1; // 左子节点索引
    const r = i * 2 + 2; // 右子节点索引
    let largest = i;     // 初始化最大值为根节点

    // 比较左子节点与当前最大值
    if (l < heapSize && a[l] > a[largest]) {
        largest = l;
    }
    // 比较右子节点与当前最大值（修正此处 bug）
    if (r < heapSize && a[r] > a[largest]) {
        largest = r;
    }

    // 如果最大值不是根节点，交换位置，并递归调整子树
    if (largest !== i) {
        swap(a, i, largest);
        maxHeapify(a, largest, heapSize); // 递归调整被交换的子节点
    }
};

// 交换数组中两个元素的位置
const swap = (a, i, j) => {
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
};