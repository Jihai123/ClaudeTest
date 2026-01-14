#!/bin/bash
#
# 关键词刷新流水线 - 安全的重新爬取脚本
#
# 用法:
#   ./run_keyword_refresh.sh [选项]
#
# 功能:
#   1. 使用新关键词重新爬取城市图片
#   2. 确保不会覆盖已上传的图片
#   3. 新图片使用唯一文件名，避免冲突
#
# 安全措施:
#   - 清除本地缓存，但不影响R2上的文件
#   - 使用时间戳+随机字符串命名，绝不覆盖
#   - 数据库中新增记录，不删除旧记录
#

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CONDA_ENV="img"
DOWNLOADER_PATH="${DOWNLOADER_PATH:-image_downloader.py}"

# 关键词刷新专用配置文件
REFRESH_CONFIG_FILE="$SCRIPT_DIR/crawl_config_refresh.json"
DEFAULT_CONFIG_FILE="$SCRIPT_DIR/crawl_config.json"

# 加载.env文件
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# 默认参数
DRY_RUN=""
LIMIT=""
ENGINE="Bing"
MAX_NUMBER=5
TEMPLATE_INDEX=""
LIST_TYPE=""
CITY_ID=""
SKIP_CONFIRM=""
BACKUP_ENABLED="true"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

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

log_important() {
    echo -e "${MAGENTA}[IMPORTANT]${NC} $1"
}

show_help() {
    cat << EOF
关键词刷新流水线 - 安全的重新爬取脚本

${YELLOW}功能说明:${NC}
  使用新关键词重新爬取城市图片，确保不会覆盖已上传的图片。

${YELLOW}安全措施:${NC}
  1. 清除本地缓存（raw_images, filtered_images），不影响R2
  2. 新图片使用唯一文件名（时间戳+随机字符串）
  3. 数据库中新增记录，不会删除旧记录
  4. R2上传前会检查是否存在，避免覆盖

${YELLOW}用法:${NC}
  ./run_keyword_refresh.sh [选项]

${YELLOW}选项:${NC}
  --config FILE       使用指定的关键词配置文件（默认: crawl_config_refresh.json）
  --template N        使用指定的关键词模板索引
  --list-type TYPE    只刷新指定榜单 (china_general/china_layflat/world)
  --city-id ID        只刷新指定城市ID
  --limit N           限制刷新的城市数量
  --engine ENGINE     搜索引擎 (Google/Baidu/Bing)
  --max-number N      每城市爬取图片数
  --dry-run           试运行，不实际执行
  --skip-confirm      跳过确认提示
  --no-backup         不备份本地缓存
  --show-templates    显示关键词模板
  --help              显示此帮助

${YELLOW}工作流程:${NC}
  1. 备份当前本地缓存（可选）
  2. 清除本地 raw_images 和 filtered_images
  3. 使用新关键词重新爬取
  4. 筛选图片（使用唯一文件名）
  5. 上传到R2并导入数据库

${YELLOW}示例:${NC}
  # 使用新关键词配置刷新所有城市
  ./run_keyword_refresh.sh

  # 只刷新躺平榜前10个城市
  ./run_keyword_refresh.sh --list-type china_layflat --limit 10

  # 使用指定模板刷新
  ./run_keyword_refresh.sh --template 0

  # 只刷新指定城市
  ./run_keyword_refresh.sh --city-id 1211

  # 试运行查看会执行什么
  ./run_keyword_refresh.sh --dry-run

${YELLOW}配置文件:${NC}
  默认使用 crawl_config_refresh.json，可以设置新的关键词模板：

  {
    "search_templates": [
      "{city}新关键词1",
      "{city}新关键词2"
    ]
  }

${YELLOW}注意事项:${NC}
  - 执行前请确认新关键词配置正确
  - 建议先用 --dry-run 试运行
  - 新图片会追加到城市，不会替换原有图片

EOF
}

# 解析参数
SKIP_UPLOAD=""
CONFIG_FILE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        --template)
            TEMPLATE_INDEX="$2"
            shift 2
            ;;
        --list-type)
            LIST_TYPE="$2"
            shift 2
            ;;
        --city-id)
            CITY_ID="$2"
            shift 2
            ;;
        --limit)
            LIMIT="$2"
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
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --skip-confirm)
            SKIP_CONFIRM="true"
            shift
            ;;
        --no-backup)
            BACKUP_ENABLED=""
            shift
            ;;
        --downloader)
            DOWNLOADER_PATH="$2"
            shift 2
            ;;
        --skip-upload)
            SKIP_UPLOAD="--local-only"
            shift
            ;;
        --show-templates)
            cd "$SCRIPT_DIR"
            if [[ -f "$REFRESH_CONFIG_FILE" ]]; then
                echo "刷新配置文件中的关键词模板 ($REFRESH_CONFIG_FILE):"
                python3 -c "import json; data=json.load(open('$REFRESH_CONFIG_FILE')); [print(f'  [{i}] {t}') for i,t in enumerate(data.get('search_templates',[]))]"
            else
                echo "刷新配置文件不存在，显示默认配置:"
                python3 -u batch_crawl.py --show-templates
            fi
            exit 0
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

# 显示警告和确认
show_warning() {
    echo ""
    echo "=========================================="
    echo -e "${YELLOW}     关键词刷新 - 安全检查${NC}"
    echo "=========================================="
    echo ""
    log_important "此操作将执行以下步骤:"
    echo "  1. 清除本地 raw_images/ 和 filtered_images/ 目录"
    echo "  2. 使用新关键词重新爬取图片"
    echo "  3. 筛选并使用唯一文件名保存"
    echo "  4. 上传到R2（不会覆盖已有文件）"
    echo "  5. 新增数据库记录（不删除旧记录）"
    echo ""
    log_success "安全保证:"
    echo "  - R2上的现有图片不会被删除或覆盖"
    echo "  - 数据库中的现有记录不会被删除"
    echo "  - 新图片使用唯一文件名: {city_id}_{timestamp}_{random}.{ext}"
    echo ""

    if [[ -n "$CONFIG_FILE" ]]; then
        log_info "使用配置文件: $CONFIG_FILE"
    elif [[ -f "$REFRESH_CONFIG_FILE" ]]; then
        log_info "使用配置文件: $REFRESH_CONFIG_FILE"
    else
        log_warn "未找到刷新配置文件，将使用默认配置"
    fi

    [[ -n "$TEMPLATE_INDEX" ]] && log_info "指定模板索引: $TEMPLATE_INDEX"
    [[ -n "$LIST_TYPE" ]] && log_info "指定榜单类型: $LIST_TYPE"
    [[ -n "$CITY_ID" ]] && log_info "指定城市ID: $CITY_ID"
    [[ -n "$LIMIT" ]] && log_info "限制城市数量: $LIMIT"
    echo ""
}

# 确认执行
confirm_execution() {
    if [[ -n "$SKIP_CONFIRM" ]] || [[ -n "$DRY_RUN" ]]; then
        return 0
    fi

    echo -e "${YELLOW}确认要执行关键词刷新吗？[y/N]${NC} "
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "操作已取消"
        exit 0
    fi
}

# 备份本地缓存
backup_local_cache() {
    if [[ -z "$BACKUP_ENABLED" ]]; then
        log_info "跳过备份（--no-backup）"
        return
    fi

    local backup_dir="$SCRIPT_DIR/backup_$(date +%Y%m%d_%H%M%S)"
    local has_backup=""

    if [[ -d "$SCRIPT_DIR/raw_images" ]] && [[ "$(ls -A "$SCRIPT_DIR/raw_images" 2>/dev/null)" ]]; then
        log_info "备份 raw_images/ -> $backup_dir/raw_images/"
        mkdir -p "$backup_dir"
        cp -r "$SCRIPT_DIR/raw_images" "$backup_dir/"
        has_backup="true"
    fi

    if [[ -d "$SCRIPT_DIR/filtered_images" ]] && [[ "$(ls -A "$SCRIPT_DIR/filtered_images" 2>/dev/null)" ]]; then
        log_info "备份 filtered_images/ -> $backup_dir/filtered_images/"
        mkdir -p "$backup_dir"
        cp -r "$SCRIPT_DIR/filtered_images" "$backup_dir/"
        has_backup="true"
    fi

    if [[ -n "$has_backup" ]]; then
        log_success "备份完成: $backup_dir"
    else
        log_info "无需备份（目录为空）"
    fi
}

# 清除本地缓存
clear_local_cache() {
    log_info "清除本地缓存..."

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将删除 raw_images/ 和 filtered_images/"
        return
    fi

    if [[ -d "$SCRIPT_DIR/raw_images" ]]; then
        rm -rf "$SCRIPT_DIR/raw_images"
        log_info "已删除 raw_images/"
    fi

    if [[ -d "$SCRIPT_DIR/filtered_images" ]]; then
        rm -rf "$SCRIPT_DIR/filtered_images"
        log_info "已删除 filtered_images/"
    fi

    # 清除爬取日志（标记哪些城市已完成）
    if [[ -f "$SCRIPT_DIR/crawl_log.json" ]]; then
        rm -f "$SCRIPT_DIR/crawl_log.json"
        log_info "已删除 crawl_log.json"
    fi

    log_success "本地缓存已清除"
}

# 步骤1: 导出城市列表
step1_export_cities() {
    log_info "步骤 1/4: 导出城市列表"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行: python3 -u export_cities.py"
    else
        python3 -u export_cities.py
    fi

    log_success "城市列表导出完成"
    echo ""
}

# 步骤2: 使用新关键词爬取
step2_crawl_with_new_keywords() {
    log_info "步骤 2/4: 使用新关键词爬取图片"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    # 如果指定了刷新配置文件，临时替换
    local use_temp_config=""
    if [[ -n "$CONFIG_FILE" ]] && [[ -f "$CONFIG_FILE" ]]; then
        log_info "使用指定配置文件: $CONFIG_FILE"
        cp "$DEFAULT_CONFIG_FILE" "$DEFAULT_CONFIG_FILE.bak" 2>/dev/null || true
        cp "$CONFIG_FILE" "$DEFAULT_CONFIG_FILE"
        use_temp_config="true"
    elif [[ -f "$REFRESH_CONFIG_FILE" ]]; then
        log_info "使用刷新配置文件: $REFRESH_CONFIG_FILE"
        cp "$DEFAULT_CONFIG_FILE" "$DEFAULT_CONFIG_FILE.bak" 2>/dev/null || true
        cp "$REFRESH_CONFIG_FILE" "$DEFAULT_CONFIG_FILE"
        use_temp_config="true"
    fi

    # 构建命令
    CMD="python3 -u batch_crawl.py"
    CMD="$CMD --downloader $DOWNLOADER_PATH"
    CMD="$CMD --engine $ENGINE"
    CMD="$CMD --max-number $MAX_NUMBER"
    CMD="$CMD --force"  # 强制模式，因为我们已经清除了日志

    [[ -n "$TEMPLATE_INDEX" ]] && CMD="$CMD --template-index $TEMPLATE_INDEX"
    [[ -n "$LIST_TYPE" ]] && CMD="$CMD --list-type $LIST_TYPE"
    [[ -n "$CITY_ID" ]] && CMD="$CMD --city-id $CITY_ID"
    [[ -n "$LIMIT" ]] && CMD="$CMD --limit $LIMIT"
    [[ -n "$DRY_RUN" ]] && CMD="$CMD --dry-run"

    log_info "执行命令: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行上述命令"
    else
        # 激活conda环境
        if command -v conda &> /dev/null && conda env list | grep -q "^$CONDA_ENV "; then
            log_info "激活 conda 环境: $CONDA_ENV"
            eval "$(conda shell.bash hook)"
            conda activate $CONDA_ENV
        fi

        eval $CMD
    fi

    # 恢复原配置文件
    if [[ -n "$use_temp_config" ]] && [[ -f "$DEFAULT_CONFIG_FILE.bak" ]]; then
        mv "$DEFAULT_CONFIG_FILE.bak" "$DEFAULT_CONFIG_FILE"
        log_info "已恢复原配置文件"
    fi

    log_success "图片爬取完成"
    echo ""
}

# 步骤3: 筛选图片（使用唯一文件名）
step3_filter_with_unique_names() {
    log_info "步骤 3/4: 筛选图片（使用唯一文件名）"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    # 使用 --unique-names 选项确保文件名唯一
    CMD="python3 -u filter_images.py --unique-names"
    [[ -n "$DRY_RUN" ]] && CMD="$CMD --dry-run"

    log_info "执行命令: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行上述命令"
    else
        eval $CMD
    fi

    log_success "图片筛选完成（使用唯一文件名）"
    echo ""
}

# 步骤4: 安全上传到R2
step4_safe_upload() {
    log_info "步骤 4/4: 安全上传到R2并导入数据库"
    echo "----------------------------------------"

    cd "$SCRIPT_DIR"

    # 检查R2配置
    if [[ -z "$SKIP_UPLOAD" ]]; then
        if [[ -z "$R2_ACCOUNT_ID" || -z "$R2_ACCESS_KEY_ID" || -z "$R2_SECRET_ACCESS_KEY" || -z "$R2_BUCKET_NAME" ]]; then
            log_warn "R2环境变量未完整配置，将使用本地模式"
            SKIP_UPLOAD="--local-only"
        fi
    fi

    # 使用 --no-overwrite 选项确保不覆盖
    CMD="python3 -u import_to_db.py --no-overwrite"
    [[ -n "$SKIP_UPLOAD" ]] && CMD="$CMD $SKIP_UPLOAD"
    [[ -n "$CITY_ID" ]] && CMD="$CMD --city-id $CITY_ID"
    [[ -n "$DRY_RUN" ]] && CMD="$CMD --dry-run"

    log_info "执行命令: $CMD"

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "[DRY-RUN] 将执行上述命令"
    else
        eval $CMD
    fi

    log_success "数据导入完成"
    echo ""
}

# 主流程
main() {
    echo ""
    echo "=========================================="
    echo -e "${MAGENTA}     关键词刷新流水线 - 安全执行脚本${NC}"
    echo "=========================================="
    echo ""

    check_python

    # 显示警告
    show_warning

    if [[ -n "$DRY_RUN" ]]; then
        log_warn "试运行模式 - 不会实际执行操作"
        echo ""
    fi

    # 确认执行
    confirm_execution

    echo ""
    echo "=========================================="
    echo "开始执行关键词刷新流程..."
    echo "=========================================="
    echo ""

    # 备份
    backup_local_cache
    echo ""

    # 清除本地缓存
    clear_local_cache
    echo ""

    # 执行四个步骤
    step1_export_cities
    step2_crawl_with_new_keywords
    step3_filter_with_unique_names
    step4_safe_upload

    echo "=========================================="
    log_success "关键词刷新完成!"
    echo "=========================================="
    echo ""
    log_important "结果说明:"
    echo "  - 新图片已使用唯一文件名上传"
    echo "  - R2上的原有图片未被修改"
    echo "  - 数据库中新增了图片记录"
    echo ""
    echo "输出目录:"
    echo "  - 原始图片: $SCRIPT_DIR/raw_images/"
    echo "  - 筛选图片: $SCRIPT_DIR/filtered_images/"
    echo ""
    echo "日志文件:"
    echo "  - 爬取日志: $SCRIPT_DIR/crawl_log.json"
    echo "  - 筛选日志: $SCRIPT_DIR/filter_log.json"
    echo "  - 导入日志: $SCRIPT_DIR/import_log.json"
    echo ""
}

main
