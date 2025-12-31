#!/bin/bash

# 评价系统API测试脚本
# 测试评价的创建、读取、更新、删除、标记有用等功能

BASE_URL="http://localhost:3000/api"
CITY_ID=1
USER_ID=1

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 计数器
TOTAL_TESTS=0
PASSED_TESTS=0

# 测试函数
test_api() {
  local name=$1
  local url=$2
  local method=${3:-GET}
  local data=$4
  local expected_field=$5

  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -e "\n${YELLOW}测试 #${TOTAL_TESTS}: ${name}${NC}"
  echo "URL: $url"
  echo "方法: $method"

  if [ "$method" = "GET" ]; then
    response=$(curl -s "$url")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url")
  elif [ "$method" = "PUT" ]; then
    response=$(curl -s -X PUT \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url")
  elif [ "$method" = "DELETE" ]; then
    response=$(curl -s -X DELETE \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url")
  fi

  echo "响应: $response"

  # 检查响应是否包含预期字段
  if [ -n "$expected_field" ]; then
    if echo "$response" | grep -q "$expected_field"; then
      echo -e "${GREEN}✓ 通过${NC}"
      PASSED_TESTS=$((PASSED_TESTS + 1))
      return 0
    else
      echo -e "${RED}✗ 失败 - 未找到字段: $expected_field${NC}"
      return 1
    fi
  else
    echo -e "${GREEN}✓ 通过${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    return 0
  fi
}

echo "================================="
echo "  评价系统API测试"
echo "================================="
echo "目标服务器: $BASE_URL"
echo "测试城市ID: $CITY_ID"
echo ""

# 测试1: 创建评价（基础）
echo -e "\n${YELLOW}=== 1. 创建评价测试 ===${NC}"

REVIEW_DATA='{
  "city_id": '$CITY_ID',
  "user_id": '$USER_ID',
  "rating": 4.5,
  "comment": "这是一个测试评价，城市环境不错，适合居住。",
  "living_duration": "2-5年",
  "living_purpose": "工作",
  "residence_years": 3,
  "is_anonymous": false,
  "living_cost_rating": 4.0,
  "air_quality_rating": 4.5,
  "medical_rating": 4.2,
  "employment_rating": 4.8,
  "safety_rating": 4.6,
  "elderly_care_rating": 3.8,
  "images": []
}'

test_api "创建基础评价" \
  "$BASE_URL/reviews" \
  "POST" \
  "$REVIEW_DATA" \
  "review_id"

# 保存review_id (从响应中提取)
REVIEW_ID=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$REVIEW_DATA" \
  "$BASE_URL/reviews" | grep -o '"review_id":[0-9]*' | grep -o '[0-9]*')

echo "创建的评价ID: $REVIEW_ID"

# 测试2: 获取城市的所有评价
echo -e "\n${YELLOW}=== 2. 获取评价列表测试 ===${NC}"

test_api "获取城市评价列表" \
  "$BASE_URL/reviews/city/$CITY_ID" \
  "GET" \
  "" \
  "reviews"

# 测试3: 获取单个评价详情
if [ -n "$REVIEW_ID" ]; then
  test_api "获取评价详情" \
    "$BASE_URL/reviews/$REVIEW_ID" \
    "GET" \
    "" \
    "comment"
fi

# 测试4: 按不同方式排序
test_api "按最有用排序" \
  "$BASE_URL/reviews/city/$CITY_ID?sort=helpful" \
  "GET" \
  "" \
  "reviews"

test_api "按评分排序" \
  "$BASE_URL/reviews/city/$CITY_ID?sort=rating" \
  "GET" \
  "" \
  "reviews"

# 测试5: 分页
test_api "分页测试(page=1, limit=5)" \
  "$BASE_URL/reviews/city/$CITY_ID?page=1&limit=5" \
  "GET" \
  "" \
  "pagination"

# 测试6: 获取评价统计信息
test_api "获取城市评价统计" \
  "$BASE_URL/reviews/city/$CITY_ID/stats" \
  "GET" \
  "" \
  "total_reviews"

# 测试7: 标记评价"有用"
if [ -n "$REVIEW_ID" ]; then
  test_api "标记评价为有用" \
    "$BASE_URL/reviews/$REVIEW_ID/helpful" \
    "POST" \
    '{"user_id": 2, "is_helpful": true}' \
    "helpful_count"
fi

# 测试8: 更新评价
if [ -n "$REVIEW_ID" ]; then
  UPDATE_DATA='{
    "user_id": '$USER_ID',
    "rating": 5.0,
    "comment": "更新后的评价：更加满意了！",
    "living_cost_rating": 4.5,
    "air_quality_rating": 5.0
  }'

  test_api "更新评价" \
    "$BASE_URL/reviews/$REVIEW_ID" \
    "PUT" \
    "$UPDATE_DATA" \
    "message"
fi

# 测试9: 创建带图片的评价
REVIEW_WITH_IMAGES='{
  "city_id": '$CITY_ID',
  "user_id": '$USER_ID',
  "rating": 4.8,
  "comment": "带图片的评价测试",
  "images": [
    "/uploads/reviews/test1.jpg",
    "/uploads/reviews/test2.jpg",
    "/uploads/reviews/test3.jpg"
  ]
}'

test_api "创建带图片评价" \
  "$BASE_URL/reviews" \
  "POST" \
  "$REVIEW_WITH_IMAGES" \
  "review_id"

# 测试10: 创建匿名评价
ANONYMOUS_REVIEW='{
  "city_id": '$CITY_ID',
  "user_id": '$USER_ID',
  "rating": 3.5,
  "comment": "匿名评价测试",
  "is_anonymous": true
}'

test_api "创建匿名评价" \
  "$BASE_URL/reviews" \
  "POST" \
  "$ANONYMOUS_REVIEW" \
  "review_id"

# 测试11: 删除评价（放在最后）
if [ -n "$REVIEW_ID" ]; then
  test_api "删除评价" \
    "$BASE_URL/reviews/$REVIEW_ID" \
    "DELETE" \
    "{\"user_id\": $USER_ID}" \
    "message"
fi

# 测试12: 验证数据完整性 - 检查六维评分
test_api "验证六维评分数据" \
  "$BASE_URL/reviews/city/$CITY_ID/stats" \
  "GET" \
  "" \
  "dimension_avg"

# 汇总结果
echo ""
echo "================================="
echo "  测试结果汇总"
echo "================================="
echo -e "总测试数: ${TOTAL_TESTS}"
echo -e "通过: ${GREEN}${PASSED_TESTS}${NC}"
echo -e "失败: ${RED}$((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo -e "通过率: $((PASSED_TESTS * 100 / TOTAL_TESTS))%"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
  echo -e "\n${GREEN}🎉 所有测试通过！${NC}"
  exit 0
else
  echo -e "\n${RED}❌ 部分测试失败${NC}"
  exit 1
fi
