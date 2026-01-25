#!/bin/bash
#
# 城市数据爬取一键执行脚本
# 完整流程：爬取 -> 筛选 -> 导入数据库
#
# 用法:
#   ./run_data_pipeline.sh                    # 执行全部流程
#   ./run_data_pipeline.sh --step 1           # 只执行第1步（爬取）
#   ./run_data_pipeline.sh --step 2           # 只执行第2步（筛选）
#   ./run_data_pipeline.sh --step 3           # 只执行第3步（导入）
#   ./run_data_pipeline.sh --dry-run          # 试运行
#   ./run_data_pipeline.sh --type housing     # 只爬取房价数据
#   ./run_data_pipeline.sh --skip-completed   # 跳过已完成城市
#

set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 默认参数
STEP=""
DRY_RUN=""
CRAWL_TYPE="all"
SKIP_COMPLETED=""
LIMIT=""
CITY_ID=""
FORCE=""

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --step|-s)
            STEP="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --type|-t)
            CRAWL_TYPE="$2"
            shift 2
            ;;
        --skip-completed)
            SKIP_COMPLETED="--skip-completed"
            shift
            ;;
        --limit|-l)
            LIMIT="--limit $2"
            shift 2
            ;;
        --city-id)
            CITY_ID="--city-id $2"
            shift 2
            ;;
        --force|-f)
            FORCE="--force"
            shift
            ;;
        -h|--help)
            echo "城市数据爬取一键执行脚本"
            echo ""
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --step, -s N          只执行第N步 (1=爬取, 2=筛选, 3=导入)"
            echo "  --dry-run             试运行模式"
            echo "  --type, -t TYPE       爬取类型 (all/basic/housing/weather/quality)"
            echo "  --skip-completed      跳过已完成的城市"
            echo "  --limit, -l N         限制城市数量"
            echo "  --city-id ID          只处理指定城市"
            echo "  --force, -f           强制覆盖现有数据"
            echo "  -h, --help            显示帮助信息"
            echo ""
            echo "示例:"
            echo "  $0                          # 执行全部流程"
            echo "  $0 --type housing           # 只爬取房价数据"
            echo "  $0 --step 1 --dry-run       # 试运行爬取步骤"
            echo "  $0 --skip-completed         # 跳过已完成城市"
            exit 0
            ;;
        *)
            error "未知参数: $1"
            exit 1
            ;;
    esac
done

# 检查Python环境
check_python() {
    if ! command -v python3 &> /dev/null; then
        error "Python3 未安装"
        exit 1
    fi
    info "Python版本: $(python3 --version)"
}

# 检查依赖
check_dependencies() {
    info "检查Python依赖..."
    python3 -c "import requests, bs4" 2>/dev/null || {
        warn "缺少依赖，正在安装..."
        pip3 install -r requirements.txt
    }
    success "依赖检查完成"
}

# 检查城市列表文件
check_cities_file() {
    CITIES_FILE="../cities.json"
    if [[ ! -f "$CITIES_FILE" ]]; then
        warn "城市列表文件不存在，正在生成..."
        python3 ../export_cities.py
    fi
    CITY_COUNT=$(python3 -c "import json; print(len(json.load(open('$CITIES_FILE'))['cities']))")
    info "城市列表: $CITY_COUNT 个城市"
}

# 步骤1: 爬取数据
step_crawl() {
    echo ""
    echo "=========================================="
    echo "步骤1: 爬取城市数据"
    echo "=========================================="

    CMD="python3 crawl_all.py --type $CRAWL_TYPE $SKIP_COMPLETED $LIMIT $CITY_ID $DRY_RUN"
    info "执行: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        eval $CMD
    else
        eval $CMD
        success "爬取完成"
    fi
}

# 步骤2: 筛选数据
step_filter() {
    echo ""
    echo "=========================================="
    echo "步骤2: 筛选和验证数据"
    echo "=========================================="

    CMD="python3 filter_data.py $DRY_RUN"
    info "执行: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        eval $CMD
    else
        eval $CMD
        success "筛选完成"
    fi
}

# 步骤3: 导入数据库（含自动备份）
step_import() {
    echo ""
    echo "=========================================="
    echo "步骤3: 导入数据库"
    echo "=========================================="

    # 导入前自动备份
    if [[ -z "$DRY_RUN" ]]; then
        info "创建导入前备份..."
        python3 data_backup.py backup -d "pipeline自动备份 ($(date '+%Y-%m-%d %H:%M'))"
        success "备份完成"
    fi

    CMD="python3 import_data.py $CITY_ID $FORCE $DRY_RUN"
    info "执行: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        eval $CMD
    else
        eval $CMD
        success "导入完成"
    fi

    # 导入后验证
    if [[ -z "$DRY_RUN" ]]; then
        info "验证数据..."
        python3 data_backup.py validate
    fi
}

# 主流程
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║              城市数据爬取流水线                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""

    if [[ -n "$DRY_RUN" ]]; then
        warn "=== 试运行模式 ==="
    fi

    # 环境检查
    check_python
    check_dependencies
    check_cities_file

    # 根据步骤参数执行
    case "$STEP" in
        1)
            step_crawl
            ;;
        2)
            step_filter
            ;;
        3)
            step_import
            ;;
        "")
            # 执行全部步骤
            step_crawl
            step_filter
            step_import
            ;;
        *)
            error "无效的步骤: $STEP (有效值: 1, 2, 3)"
            exit 1
            ;;
    esac

    echo ""
    echo "=========================================="
    if [[ -n "$DRY_RUN" ]]; then
        info "试运行完成"
    else
        success "全部流程完成!"
    fi
    echo "=========================================="
    echo ""

    # 显示数据目录信息
    if [[ -z "$DRY_RUN" ]]; then
        info "数据文件位置:"
        echo "  原始数据: $SCRIPT_DIR/raw_data/"
        echo "  筛选数据: $SCRIPT_DIR/filtered_data/"
        echo "  日志文件: $SCRIPT_DIR/logs/"
    fi
}

main
