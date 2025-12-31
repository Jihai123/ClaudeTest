#!/bin/bash

# API测试脚本
BASE_URL="http://localhost:3000/api"

echo "========================================="
echo "         宜居城市小程序 API 测试"
echo "========================================="
echo ""

# 测试计数器
TOTAL=0
PASSED=0
FAILED=0

test_api() {
  local name="$1"
  local url="$2"
  local expected_key="$3"

  TOTAL=$((TOTAL + 1))
  echo -n "[$TOTAL] 测试 $name ... "

  response=$(curl -s "$url")

  if echo "$response" | grep -q "\"$expected_key\""; then
    echo "✓ 通过"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo "✗ 失败"
    echo "   响应: ${response:0:100}"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# 1. 健康检查
test_api "健康检查" "$BASE_URL/health" "status"

# 2. 获取城市列表
test_api "获取城市列表" "$BASE_URL/cities?limit=5" "cities"

# 3. 搜索城市
test_api "搜索城市(北京)" "$BASE_URL/cities?keywords=北京" "cities"

# 4. 获取城市详情
test_api "获取城市详情(ID=1)" "$BASE_URL/cities/1" "id"

# 5. 按综合评分排序
test_api "按综合评分排序" "$BASE_URL/cities?sort=overall_score&order=DESC&limit=5" "cities"

# 6. 筛选沿海城市
test_api "筛选沿海城市" "$BASE_URL/cities?filters=%7B%22coastal%22%3Atrue%7D&limit=5" "cities"

# 7. 筛选一线城市
test_api "筛选一线城市" "$BASE_URL/cities?keywords=北京,上海,广州,深圳&limit=10" "cities"

# 8. 维度范围筛选(生活成本)
test_api "维度筛选(生活成本)" "$BASE_URL/cities?filters=%7B%22living_cost_max%22%3A6%7D&limit=5" "cities"

# 9. 获取榜单列表
test_api "获取榜单列表" "$BASE_URL/rankings" "rankings"

# 10. 获取城市标签
test_api "获取城市标签(ID=1)" "$BASE_URL/tags/city/1" "tags"

echo ""
echo "========================================="
echo "           测试结果汇总"
echo "========================================="
echo "总计: $TOTAL"
echo "通过: $PASSED ($(( PASSED * 100 / TOTAL ))%)"
echo "失败: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ 所有测试通过！"
  exit 0
else
  echo "⚠️  有 $FAILED 个测试失败"
  exit 1
fi
