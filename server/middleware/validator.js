const { body, param, query, validationResult } = require('express-validator');

// 处理验证错误
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // 提取第一个错误信息，返回统一格式
    const firstError = errors.array()[0];
    return res.status(400).json({
      error: firstError.msg,
      field: firstError.path,
      errors: errors.array() // 保留完整错误信息用于调试
    });
  }
  next();
};

// 用户注册验证
const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度必须在3-50个字符之间')
    .matches(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/)
    .withMessage('用户名只能包含字母、数字、下划线和中文'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('请提供有效的邮箱地址')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码长度至少为6个字符'),
  handleValidationErrors
];

// 用户登录验证
const validateLogin = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('请提供用户名'),
  body('password')
    .notEmpty()
    .withMessage('请提供密码'),
  handleValidationErrors
];

// 城市数据验证
const validateCity = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('城市名称不能为空')
    .isLength({ max: 100 })
    .withMessage('城市名称过长'),
  body('province')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('省份名称过长'),
  body('population')
    .optional()
    .isInt({ min: 0 })
    .withMessage('人口数必须为正整数'),
  body('gdp')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('GDP必须为正数'),
  body('area')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('面积必须为正数'),
  handleValidationErrors
];

// 城市维度验证
const validateDimensions = [
  body('living_cost')
    .isFloat({ min: 0, max: 10 })
    .withMessage('生活成本评分必须在0-10之间'),
  body('air_quality')
    .isFloat({ min: 0, max: 10 })
    .withMessage('空气质量评分必须在0-10之间'),
  body('medical_facilities')
    .isFloat({ min: 0, max: 10 })
    .withMessage('医疗设施评分必须在0-10之间'),
  body('employment')
    .isFloat({ min: 0, max: 10 })
    .withMessage('就业机会评分必须在0-10之间'),
  body('safety')
    .isFloat({ min: 0, max: 10 })
    .withMessage('安全指数评分必须在0-10之间'),
  body('elderly_care')
    .isFloat({ min: 0, max: 10 })
    .withMessage('养老评分必须在0-10之间'),
  handleValidationErrors
];

// 评价验证
const validateReview = [
  body('rating')
    .isFloat({ min: 1, max: 5 })
    .withMessage('评分必须在1-5之间'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('评论内容不能超过1000个字符'),
  handleValidationErrors
];

// 回复验证
const validateReply = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('回复内容不能为空')
    .isLength({ max: 500 })
    .withMessage('回复内容不能超过500个字符'),
  handleValidationErrors
];

// ID参数验证
const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('无效的ID'),
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateCity,
  validateDimensions,
  validateReview,
  validateReply,
  validateId,
  handleValidationErrors
};
