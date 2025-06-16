# 🎮 拯救Zack游戏 - 服务器端统计系统

## 📋 系统概述

这是一个完整的服务器端统计系统，用于收集和分析"拯救Zack"游戏的玩家数据。系统采用客户端-服务器架构，所有统计数据都存储在服务器端，只有开发者可以查看。

## 🏗️ 系统架构

```
游戏客户端 (index.html)
    ↓ 发送统计数据
统计服务器 (stats_server.js)
    ↓ 存储数据
本地JSON文件 (server_stats.json)
    ↓ 开发者查看
管理员面板 (admin_dashboard.html)
```

## 📊 统计数据类型

- **👥 总玩家数**: 访问游戏的独立用户数
- **🎮 总游戏次数**: 游戏开始的总次数
- **🏆 总关卡完成数**: 所有关卡完成的总次数
- **🗝️ 总钥匙收集数**: 收集钥匙的总次数
- **👑 总CEO晋升数**: 完成游戏获得CEO称号的次数
- **📅 每日统计**: 按日期分组的详细数据
- **📈 各关卡统计**: 每个关卡的完成次数

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动统计服务器

```bash
npm start
```

服务器将在 `http://localhost:3001` 启动

### 3. 访问管理员面板

打开浏览器访问: `admin_dashboard.html`

管理员密钥: `zack_admin_2024`

## 📁 文件说明

### 核心文件

- **`stats_server.js`** - 统计服务器主程序
- **`index.html`** - 游戏主文件（已集成统计代码）
- **`admin_dashboard.html`** - 开发者统计面板
- **`package.json`** - Node.js项目配置
- **`server_stats.json`** - 统计数据存储文件（自动生成）

### 开发工具

- **`dev_stats.js`** - 命令行统计工具
- **`STATS_SYSTEM_README.md`** - 本说明文档

## 🔧 开发者使用指南

### 启动开发环境

```bash
# 安装依赖
npm install

# 启动统计服务器
npm start

# 或使用开发模式（自动重启）
npm run dev
```

### 查看统计数据

#### 方法1: 网页管理面板
1. 打开 `admin_dashboard.html`
2. 输入管理员密钥: `zack_admin_2024`
3. 点击"查看统计数据"

#### 方法2: 命令行工具
```bash
# 查看统计摘要
npm run stats show

# 生成详细报告
npm run stats report

# 导出数据到文件
npm run stats export stats_backup.json

# 重置所有数据（需要确认）
npm run stats reset --confirm
```

#### 方法3: API直接访问
```bash
# 获取统计数据
curl "http://localhost:3001/api/admin/stats?adminKey=zack_admin_2024"

# 健康检查
curl "http://localhost:3001/health"
```

## 🔒 安全性说明

### 数据隐私
- ✅ **完全匿名**: 不收集任何个人信息
- ✅ **无跟踪**: 不使用cookies或持久化标识符
- ✅ **本地存储**: 数据仅存储在你的服务器上
- ✅ **开发者专用**: 普通用户无法看到任何统计信息

### 访问控制
- 🔐 管理员密钥保护
- 🔐 仅开发者可访问统计数据
- 🔐 游戏体验不受影响（静默收集）

## 📈 API接口文档

### 统计收集接口

#### 新玩家访问
```http
POST /api/stats/new-player
Content-Type: application/json

{}
```

#### 游戏开始
```http
POST /api/stats/game-start
Content-Type: application/json

{
  "sessionId": "session_id_here"
}
```

#### 关卡完成
```http
POST /api/stats/level-complete
Content-Type: application/json

{
  "sessionId": "session_id_here",
  "level": 1
}
```

#### 钥匙收集
```http
POST /api/stats/key-collected
Content-Type: application/json

{
  "sessionId": "session_id_here"
}
```

#### CEO晋升
```http
POST /api/stats/ceo-promotion
Content-Type: application/json

{
  "sessionId": "session_id_here"
}
```

### 管理员接口

#### 获取统计数据
```http
GET /api/admin/stats?adminKey=zack_admin_2024
```

#### 重置统计数据
```http
POST /api/admin/reset-stats
Content-Type: application/json

{
  "adminKey": "zack_admin_2024"
}
```

## 🛠️ 部署说明

### 本地开发
```bash
npm start
```

### 生产环境部署

#### 使用PM2
```bash
npm install -g pm2
pm2 start stats_server.js --name "zack-stats"
pm2 save
pm2 startup
```

#### 使用Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

#### 环境变量
```bash
# 设置端口
export PORT=3001

# 设置管理员密钥
export ADMIN_KEY=your_secure_key_here
```

## 🔧 配置选项

### 服务器配置
在 `stats_server.js` 中修改：

```javascript
const PORT = process.env.PORT || 3001;
const ADMIN_KEY = process.env.ADMIN_KEY || 'zack_admin_2024';
```

### 客户端配置
在 `index.html` 中修改：

```javascript
const gameStats = {
    statsServerUrl: 'http://localhost:3001', // 修改为你的服务器地址
    // ...
};
```

## 📊 数据格式说明

### 统计数据结构
```json
{
  "totalPlayers": 0,
  "totalGames": 0,
  "totalLevelsCompleted": 0,
  "totalKeysCollected": 0,
  "totalCEOPromotions": 0,
  "dailyStats": {
    "2024-01-01": {
      "players": 5,
      "games": 8,
      "levels": 25
    }
  },
  "levelStats": {
    "1": 10,
    "2": 8,
    "3": 6,
    "4": 4,
    "5": 3,
    "6": 2,
    "7": 2,
    "8": 1,
    "9": 1,
    "10": 1
  },
  "sessions": [
    {
      "sessionId": "1234567890_abc123",
      "startTime": "2024-01-01T12:00:00.000Z",
      "userAgent": "Mozilla/5.0...",
      "ip": "127.0.0.1"
    }
  ],
  "lastUpdated": "2024-01-01T12:00:00.000Z"
}
```

## 🐛 故障排除

### 常见问题

#### 1. 服务器无法启动
```bash
# 检查端口是否被占用
lsof -i :3001

# 更换端口
PORT=3002 npm start
```

#### 2. 游戏无法连接统计服务器
- 确保服务器正在运行
- 检查防火墙设置
- 确认客户端配置的服务器地址正确

#### 3. 管理员面板无法访问
- 检查管理员密钥是否正确
- 确认服务器健康检查通过
- 查看浏览器控制台错误信息

#### 4. 数据丢失
- 检查 `server_stats.json` 文件权限
- 确保有足够的磁盘空间
- 查看服务器日志

### 日志查看
```bash
# 查看服务器日志
npm start

# 使用PM2查看日志
pm2 logs zack-stats
```

## 📝 更新日志

### v1.0.0 (2024-01-01)
- ✅ 初始版本发布
- ✅ 基础统计功能
- ✅ 管理员面板
- ✅ API接口
- ✅ 安全性保护

## 🤝 技术支持

如果遇到问题，请检查：

1. **服务器状态**: `curl http://localhost:3001/health`
2. **日志信息**: 查看控制台输出
3. **网络连接**: 确保客户端能访问服务器
4. **权限设置**: 确保文件读写权限正确

## 📄 许可证

MIT License - 详见 LICENSE 文件

---

**🎮 享受游戏开发的乐趣！** 