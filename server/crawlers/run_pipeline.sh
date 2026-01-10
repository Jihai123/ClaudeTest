#!/bin/bash
#
# 图片爬取流水线 - 一键执行脚本
#
# 用法:
#   ./run_pipeline.sh [选项]
#
# 选项:
#   --step STEP       只运行指定步骤 (1-4)
#   --dry-run         试运行模式
#   --limit N         限制爬取城市数量
#   --engine ENGINE   搜索引擎 (Google/Baidu/Bing)
#   --downloader PATH image_downloader.py 的路径
#   --help            显示帮助
#

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CONDA_ENV="img"
DOWNLOADER_PATH="${DOWNLOADER_PATH:-image_downloader.py}"

# 默认参数
STEP=""
DRY_RUN=""
LIMIT=""
ENGINE="Bing"  # Bing效果最好，Google国内不可用
MAX_NUMBER=10

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << EOF
图片爬取流水线 - 一键执行脚本

用法:
  ./run_pipeline.sh [选项]

选项:
  --step STEP         只运行指定步骤:
                        1 - 导出城市列表
                        2 - 批量爬取图片
                        3 - 筛选图片
                        4 - 上传R2并导入数据库
  --dry-run           试运行模式，不实际执行
  --limit N           限制爬取城市数量
  --engine ENGINE     搜索引擎 (Google/Baidu/Bing)，默认 Google
  --max-number N      每城市爬取图片数，默认 10
  --downloader PATH   image_downloader.py 的路径
  --skip-upload       跳过R2上传，使用本地路径
  --help              显示此帮助

示例:
  # 完整流程
  ./run_pipeline.sh

  # 只导出城市列表
  ./run_pipeline.sh --step 1

  # 试运行，爬取前5个城市
  ./run_pipeline.sh --dry-run --limit 5

  # 使用百度搜索引擎
  ./run_pipeline.sh --engine Baidu

  # 指定 image_downloader.py 路径
  ./run_pipeline.sh --downloader /path/to/image_downloader.py

环境要求:
  - Python 3.8+
  - Pillow (pip install Pillow)
  - boto3 (pip install boto3)
  - image_downloader.py 工具
  - R2环境变量配置 (或使用 --skip-upload)

EOF
}

# 解析参数
SKIP_UPLOAD=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --step)
            STEP="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --limit)
            LIMIT="--limit $2"
            shift 2
            ;;
        --engine)
            ENGINE="$2"
            shift 2
            ;;
        --max-number)
            MAX_NUMBER="$2"
            shift 2
            ;;
        --downloader)
            DOWNLOADER_PATH="$2"
            shift 2
            ;;
        --skip-upload)
            SKIP_UPLOAD="--local-only"
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 检查Python
check_python() {
    if ! command -v python3 &> /dev/null; then
        log_error "未找到 python3"
        exit 1
    fi
}

# 步骤1: 导出城市列表
step1_export_cities() {
    log_info "步骤 1/4: 导出城市列表"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行: python3 export_cities.py"
    else
        python3 export_cities.py
    fi

    log_success "城市列表导出完成"
    echo ""
}

# 步骤2: 批量爬取图片
step2_crawl_images() {
    log_info "步骤 2/4: 批量爬取图片"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    # 构建命令
    CMD="python3 batch_crawl.py"
    CMD="$CMD --downloader $DOWNLOADER_PATH"
    CMD="$CMD --engine $ENGINE"
    CMD="$CMD --max-number $MAX_NUMBER"
    CMD="$CMD --skip-completed"
    [[ -n "$LIMIT" ]] && CMD="$CMD $LIMIT"
    [[ -n "$DRY_RUN" ]] && CMD="$CMD $DRY_RUN"

    log_info "执行命令: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行上述命令"
    else
        # 如果有conda环境，激活它
        if command -v conda &> /dev/null && conda env list | grep -q "^$CONDA_ENV "; then
            log_info "激活 conda 环境: $CONDA_ENV"
            eval "$(conda shell.bash hook)"
            conda activate $CONDA_ENV
        fi

        eval $CMD
    fi

    log_success "图片爬取完成"
    echo ""
}

# 步骤3: 筛选图片
step3_filter_images() {
    log_info "步骤 3/4: 筛选图片"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    CMD="python3 filter_images.py"
    [[ -n "$DRY_RUN" ]] && CMD="$CMD --dry-run"

    log_info "执行命令: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行上述命令"
    else
        $CMD
    fi

    log_success "图片筛选完成"
    echo ""
}

# 步骤4: 上传R2并导入数据库
step4_import() {
    log_info "步骤 4/4: 上传R2并导入数据库"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    # 检查R2配置
    if [[ -z "$SKIP_UPLOAD" ]]; then
        if [[ -z "$R2_ACCOUNT_ID" || -z "$R2_ACCESS_KEY_ID" || -z "$R2_SECRET_ACCESS_KEY" || -z "$R2_BUCKET_NAME" ]]; then
            log_warn "R2环境变量未完整配置，将使用本地模式"
            SKIP_UPLOAD="--local-only"
        fi
    fi

    CMD="python3 import_to_db.py"
    [[ -n "$SKIP_UPLOAD" ]] && CMD="$CMD $SKIP_UPLOAD"
    [[ -n "$DRY_RUN" ]] && CMD="$CMD --dry-run"

    log_info "执行命令: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行上述命令"
    else
        $CMD
    fi

    log_success "数据导入完成"
    echo ""
}

# 主流程
main() {
    echo ""
    echo "=========================================="
    echo "     图片爬取流水线 - 一键执行脚本"
    echo "=========================================="
    echo ""

    check_python

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "试运行模式 - 不会实际执行操作"
        echo ""
    fi

    # 运行指定步骤或全部
    if [[ -n "$STEP" ]]; then
        case $STEP in
            1) step1_export_cities ;;
            2) step2_crawl_images ;;
            3) step3_filter_images ;;
            4) step4_import ;;
            *)
                log_error "无效的步骤: $STEP (有效值: 1-4)"
                exit 1
                ;;
        esac
    else
        # 运行全部步骤
        step1_export_cities
        step2_crawl_images
        step3_filter_images
        step4_import
    fi

    echo "=========================================="
    log_success "流水线执行完成!"
    echo "=========================================="
    echo ""
    echo "输出目录:"
    echo "  - 原始图片: $SCRIPT_DIR/raw_images/"
    echo "  - 筛选图片: $SCRIPT_DIR/filtered_images/"
    echo ""
    echo "日志文件:"
    echo "  - 城市列表: $SCRIPT_DIR/cities.json"
    echo "  - 爬取日志: $SCRIPT_DIR/crawl_log.json"
    echo "  - 筛选日志: $SCRIPT_DIR/filter_log.json"
    echo "  - 导入日志: $SCRIPT_DIR/import_log.json"
    echo ""
}

main
