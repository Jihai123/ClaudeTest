#!/bin/bash
#
# 单城市测试脚本
# 用法: ./test_single_city.sh <城市名> <image_downloader.py路径>
#

set -e

CITY_NAME="${1:-香港}"
DOWNLOADER="${2:-image_downloader.py}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "  测试城市: $CITY_NAME"
echo "=========================================="
echo ""

# 创建临时目录
TEST_DIR="$SCRIPT_DIR/test_output"
mkdir -p "$TEST_DIR"

# 步骤1: 爬取图片
echo "[步骤1] 爬取图片..."
echo "关键词: ${CITY_NAME}风景"
echo "命令: python $DOWNLOADER \"${CITY_NAME}风景\" --engine Google --driver api --max-number 5 --output $TEST_DIR"
echo ""

# 如果有conda环境，激活它
if command -v conda &> /dev/null; then
    eval "$(conda shell.bash hook)"
    conda activate img 2>/dev/null || true
fi

python "$DOWNLOADER" "${CITY_NAME}风景" \
    --engine Google \
    --driver api \
    --max-number 5 \
    --output "$TEST_DIR"

# 统计下载的图片
IMG_COUNT=$(find "$TEST_DIR" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.webp" \) | wc -l)
echo ""
echo "下载完成，共 $IMG_COUNT 张图片"
echo ""

# 步骤2: 查看图片
echo "[步骤2] 图片列表:"
ls -la "$TEST_DIR"
echo ""

# 步骤3: 简单筛选（检查尺寸）
echo "[步骤3] 检查图片尺寸..."
for img in "$TEST_DIR"/*.{jpg,jpeg,png,webp} 2>/dev/null; do
    if [[ -f "$img" ]]; then
        # 使用 Python PIL 检查尺寸
        python3 -c "
from PIL import Image
import os
img = Image.open('$img')
w, h = img.size
size_kb = os.path.getsize('$img') / 1024
status = '✓' if w >= 800 and h >= 500 else '✗'
print(f'{status} {os.path.basename(\"$img\")}: {w}x{h}, {size_kb:.1f}KB')
" 2>/dev/null || echo "  跳过: $(basename "$img")"
    fi
done
echo ""

echo "=========================================="
echo "测试完成!"
echo "图片保存在: $TEST_DIR"
echo ""
echo "下一步:"
echo "  1. 查看图片质量: open $TEST_DIR"
echo "  2. 如果满意，运行完整流程: ./run_pipeline.sh --limit 1"
echo "=========================================="
