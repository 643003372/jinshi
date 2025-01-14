// 全局变量
let canvas, ctx, sourceImage;
let lastDegree = -100;
let lastAstigmatism = -50;
let isProcessing = false;
let originalImageData = null;
let animationFrameId = null;
let pendingUpdate = false;

// DOM 元素
let degreeSlider, astigmatismSlider, degreeValue, astigmatismValue;

// 初始化函数
function initialize() {
    // 获取DOM元素
    canvas = document.getElementById('outputCanvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    sourceImage = document.getElementById('sourceImage');
    degreeSlider = document.getElementById('degreeSlider');
    astigmatismSlider = document.getElementById('astigmatismSlider');
    degreeValue = document.getElementById('degreeValue');
    astigmatismValue = document.getElementById('astigmatismValue');

    // 等待图片加载完成
    if (sourceImage.complete) {
        initializeCanvas();
    } else {
        sourceImage.onload = initializeCanvas;
    }

    // 添加事件监听
    setupEventListeners();
}

// 设置事件监听器
function setupEventListeners() {
    // 近视度数滑块
    degreeSlider.addEventListener('input', (e) => {
        degreeValue.textContent = e.target.value;
        requestUpdate();
    });

    // 散光度数滑块
    astigmatismSlider.addEventListener('input', (e) => {
        astigmatismValue.textContent = e.target.value;
        requestUpdate();
    });

    // 窗口大小改变时重新初始化
    window.addEventListener('resize', debounce(() => {
        cancelAnimationFrame(animationFrameId);
        initializeCanvas();
    }, 250));
}

// 请求更新
function requestUpdate() {
    if (!pendingUpdate) {
        pendingUpdate = true;
        animationFrameId = requestAnimationFrame(() => {
            updateSimulation();
            pendingUpdate = false;
        });
    }
}

// 初始化 canvas 并应用模拟效果
function initializeCanvas() {
    try {
        // 获取原始图片的尺寸
        const originalWidth = sourceImage.naturalWidth;
        const originalHeight = sourceImage.naturalHeight;
        
        // 获取容器
        const container = document.querySelector('.preview-item.simulated');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // 计算适合容器的尺寸，保持原始比例
        let targetWidth, targetHeight;
        const imageRatio = originalWidth / originalHeight;
        const containerRatio = containerWidth / containerHeight;
        
        if (imageRatio > containerRatio) {
            targetWidth = containerWidth;
            targetHeight = containerWidth / imageRatio;
        } else {
            targetHeight = containerHeight;
            targetWidth = containerHeight * imageRatio;
        }
        
        // 获取设备像素比并限制最大值，以平衡性能和质量
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        
        // 设置 canvas 的实际尺寸
        canvas.width = targetWidth * dpr;
        canvas.height = targetHeight * dpr;
        
        // 设置 canvas 的显示尺寸
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        // 配置上下文
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 清空并绘制原始图片
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);
        
        // 保存原始图像数据
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // 立即应用模拟效果
        updateSimulation();
    } catch (error) {
        console.error('初始化错误:', error);
    }
}

// 防抖函数
function debounce(func, wait = 100) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 更新模拟效果
function updateSimulation() {
    if (!canvas || !ctx || !sourceImage || !originalImageData || isProcessing) return;
    
    const degree = parseInt(degreeSlider.value);
    const astigmatism = parseInt(astigmatismSlider.value);
    
    // 如果变化太小，跳过更新
    if (Math.abs(degree - lastDegree) < 5 && Math.abs(astigmatism - lastAstigmatism) < 5) {
        return;
    }
    
    isProcessing = true;
    
    try {
        // 创建新的ImageData来存储处理后的数据
        const imageData = new ImageData(
            new Uint8ClampedArray(originalImageData.data),
            originalImageData.width,
            originalImageData.height
        );
        
        // 计算模糊半径（根据度数调整系数）
        const blurRadius = Math.abs(degree) / 250;
        
        // 应用高斯模糊（近视效果）
        if (degree < 0) {
            fastGaussianBlur(imageData.data, canvas.width, canvas.height, blurRadius);
        }
        
        // 如果有散光，应用方向性模糊
        if (astigmatism < 0) {
            const astigStrength = Math.abs(astigmatism) / 250;
            fastDirectionalBlur(imageData.data, canvas.width, canvas.height, astigStrength);
        }
        
        // 更新画布
        ctx.putImageData(imageData, 0, 0);
        
        // 更新上次的值
        lastDegree = degree;
        lastAstigmatism = astigmatism;
    } catch (error) {
        console.error('模拟效果更新错误:', error);
    } finally {
        isProcessing = false;
    }
}

// 优化的快速高斯模糊算法
function fastGaussianBlur(pixels, width, height, radius) {
    if (radius < 0.5) return;
    
    const boxes = Math.ceil(radius * 3);
    const boxSize = Math.floor(boxes / 2);
    const size = width * height * 4;
    const tempPixels = new Uint8ClampedArray(size);
    
    // 水平方向模糊
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            const range = Math.min(boxSize, width - 1);
            
            // 使用滑动窗口优化
            for (let i = -range; i <= range; i++) {
                const px = Math.min(Math.max(x + i, 0), width - 1);
                const index = (y * width + px) * 4;
                r += pixels[index];
                g += pixels[index + 1];
                b += pixels[index + 2];
                a += pixels[index + 3];
            }
            
            const count = range * 2 + 1;
            const index = (y * width + x) * 4;
            tempPixels[index] = r / count;
            tempPixels[index + 1] = g / count;
            tempPixels[index + 2] = b / count;
            tempPixels[index + 3] = a / count;
        }
    }
    
    // 垂直方向模糊
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let r = 0, g = 0, b = 0, a = 0;
            const range = Math.min(boxSize, height - 1);
            
            // 使用滑动窗口优化
            for (let i = -range; i <= range; i++) {
                const py = Math.min(Math.max(y + i, 0), height - 1);
                const index = (py * width + x) * 4;
                r += tempPixels[index];
                g += tempPixels[index + 1];
                b += tempPixels[index + 2];
                a += tempPixels[index + 3];
            }
            
            const count = range * 2 + 1;
            const index = (y * width + x) * 4;
            pixels[index] = r / count;
            pixels[index + 1] = g / count;
            pixels[index + 2] = b / count;
            pixels[index + 3] = a / count;
        }
    }
}

// 优化的快速方向性模糊算法
function fastDirectionalBlur(pixels, width, height, strength) {
    if (strength < 0.5) return;
    
    const tempPixels = new Uint8ClampedArray(pixels);
    const angle = Math.PI / 4; // 45度角
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const range = Math.ceil(strength * 2);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            let count = 0;
            
            // 使用固定步长优化
            for (let i = -range; i <= range; i += 2) {
                const dx = i * cos;
                const dy = i * sin;
                const px = Math.min(Math.max(Math.round(x + dx), 0), width - 1);
                const py = Math.min(Math.max(Math.round(y + dy), 0), height - 1);
                
                const index = (py * width + px) * 4;
                r += tempPixels[index];
                g += tempPixels[index + 1];
                b += tempPixels[index + 2];
                a += tempPixels[index + 3];
                count++;
            }
            
            const index = (y * width + x) * 4;
            pixels[index] = r / count;
            pixels[index + 1] = g / count;
            pixels[index + 2] = b / count;
            pixels[index + 3] = a / count;
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initialize);
