# 🚀 Render部署指南 - 拯救Zack游戏

## 📋 部署步骤

### 1. 准备工作
确保代码已推送到GitHub主分支：
```bash
git add .
git commit -m "添加Render部署配置"
git push origin main
```

### 2. 创建Render账号
1. 访问 [render.com](https://render.com)
2. 点击 "Get Started for Free"
3. 选择 "GitHub" 登录

### 3. 部署Web Service
1. 在Render控制台点击 "New +"
2. 选择 "Web Service"
3. 连接你的GitHub仓库 `rebirth`
4. 配置以下设置：

#### 基本设置
- **Name**: `zack-rescue-game`
- **Environment**: `Node`
- **Region**: 选择离你最近的区域
- **Branch**: `main`

#### 构建设置
- **Build Command**: `npm install`
- **Start Command**: `npm start`

#### 高级设置
- **Auto-Deploy**: `Yes` (代码更新时自动部署)

### 4. 环境变量（可选）
如果需要，可以添加以下环境变量：
- `NODE_ENV`: `production`
- `PORT`: `10000` (Render会自动设置)

### 5. 部署
点击 "Create Web Service" 开始部署。

## 📊 部署后的访问地址

部署成功后，你会得到一个类似这样的URL：
`https://zack-rescue-game.onrender.com`

### 访问方式：
- **🎮 游戏主页**: `https://你的应用名.onrender.com/`
- **📊 管理面板**: `https://你的应用名.onrender.com/admin_dashboard.html`
- **🔑 管理员密钥**: `zack_admin_2024`
- **💡 健康检查**: `https://你的应用名.onrender.com/health`

## 🔧 配置说明

### render.yaml 配置文件
项目包含 `render.yaml` 配置文件，Render会自动检测并使用这些设置：

```yaml
services:
  - type: web
    name: zack-rescue-game
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
    healthCheckPath: /health
```

### 服务器配置
- **端口**: 自动从环境变量 `PORT` 获取
- **静态文件**: 自动提供游戏文件服务
- **API路由**: `/api/*` 用于统计数据
- **健康检查**: `/health` 端点

## 📈 统计系统功能

部署后，统计系统会自动工作：

### 数据收集
- 👥 玩家访问统计
- 🎮 游戏开始次数
- 🏆 关卡完成情况
- 🗝️ 钥匙收集数据
- 👑 CEO晋升统计

### 数据查看
1. 访问管理面板：`https://你的域名/admin_dashboard.html`
2. 输入管理员密钥：`zack_admin_2024`
3. 查看实时统计数据

## 🔒 安全特性

- ✅ **匿名统计**: 不收集个人信息
- ✅ **管理员保护**: 密钥验证访问
- ✅ **HTTPS加密**: Render自动提供SSL证书
- ✅ **CORS配置**: 跨域请求保护

## 🚨 故障排除

### 常见问题

#### 1. 部署失败
- 检查 `package.json` 是否正确
- 确保所有依赖都在 `dependencies` 中
- 查看Render部署日志

#### 2. 应用无法访问
- 检查健康检查端点：`/health`
- 确认端口配置正确
- 查看应用日志

#### 3. 统计数据不显示
- 检查管理员密钥是否正确
- 确认API端点可访问
- 查看浏览器控制台错误

### 查看日志
在Render控制台中：
1. 进入你的Web Service
2. 点击 "Logs" 标签
3. 查看实时日志输出

## 💰 费用说明

### 免费计划限制
- **内存**: 512MB
- **CPU**: 共享
- **带宽**: 100GB/月
- **构建时间**: 500分钟/月
- **休眠**: 15分钟无活动后休眠

### 唤醒时间
免费计划的应用在无活动15分钟后会休眠，首次访问可能需要30-60秒唤醒。

## 🔄 更新部署

### 自动部署
推送代码到GitHub主分支会自动触发重新部署：
```bash
git add .
git commit -m "更新游戏功能"
git push origin main
```

### 手动部署
在Render控制台中点击 "Manual Deploy" → "Deploy latest commit"

## 📞 技术支持

如果遇到问题：
1. 查看Render官方文档：https://render.com/docs
2. 检查项目的 `STATS_SYSTEM_README.md` 文件
3. 查看应用日志排查问题

---

**🎮 享受你的在线游戏统计系统！** 