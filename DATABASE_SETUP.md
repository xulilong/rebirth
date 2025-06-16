# 🗄️ PostgreSQL 数据库设置指南

## 📋 数据库表结构

系统会自动创建以下4个表：

### 1. `game_stats` - 基础统计表
```sql
CREATE TABLE game_stats (
    id SERIAL PRIMARY KEY,
    stat_key VARCHAR(50) UNIQUE NOT NULL,
    stat_value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `game_sessions` - 用户会话表
```sql
CREATE TABLE game_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip_address INET,
    referrer TEXT,
    language VARCHAR(10),
    screen_size VARCHAR(20)
);
```

### 3. `game_events` - 游戏事件表
```sql
CREATE TABLE game_events (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. `daily_stats` - 每日统计表
```sql
CREATE TABLE daily_stats (
    id SERIAL PRIMARY KEY,
    stat_date DATE UNIQUE NOT NULL,
    players INTEGER DEFAULT 0,
    games INTEGER DEFAULT 0,
    levels INTEGER DEFAULT 0,
    keys INTEGER DEFAULT 0,
    ceo_promotions INTEGER DEFAULT 0
);
```

## 🔧 Render 数据库配置步骤

### 1. 创建 PostgreSQL 数据库

1. 登录 [Render Dashboard](https://dashboard.render.com)
2. 点击 **"+ New"** → **"PostgreSQL"**
3. 填写数据库信息：
   - **Name**: `zack-game-database`
   - **Database**: `zack_stats` (可选)
   - **User**: `zack_user` (可选)
   - **Region**: 选择与你的服务相同的区域
   - **PostgreSQL Version**: 使用默认版本
   - **Instance Type**: 选择 **Free** 或根据需要选择付费版本
4. 点击 **"Create Database"**

### 2. 获取数据库连接信息

数据库创建完成后：

1. 进入数据库详情页面
2. 在 **"Connect"** 部分找到：
   - **Internal Database URL** (推荐，用于同区域服务)
   - **External Database URL** (用于外部连接)

连接字符串格式：
```
postgresql://username:password@hostname:port/database
```

### 3. 配置环境变量

在你的 Render Web Service 中：

1. 进入服务设置页面
2. 找到 **"Environment Variables"** 部分
3. 添加环境变量：
   - **Key**: `DATABASE_URL`
   - **Value**: 你的数据库内部连接字符串

### 4. 部署更新

1. 推送代码到 GitHub
2. Render 会自动重新部署
3. 查看部署日志，确认看到：
   ```
   ✅ PostgreSQL 连接成功
   ✅ 数据库表初始化完成
   ```

## 📊 数据库管理

### 连接到数据库

使用 psql 命令行工具：
```bash
psql "你的外部数据库URL"
```

### 常用查询

```sql
-- 查看所有表
\dt

-- 查看基础统计
SELECT * FROM game_stats;

-- 查看最近的游戏会话
SELECT * FROM game_sessions ORDER BY start_time DESC LIMIT 10;

-- 查看每日统计
SELECT * FROM daily_stats ORDER BY stat_date DESC;

-- 查看游戏事件
SELECT event_type, COUNT(*) as count 
FROM game_events 
GROUP BY event_type;

-- 查看关卡完成统计
SELECT event_data->>'level' as level, COUNT(*) as completions
FROM game_events 
WHERE event_type = 'level_complete'
GROUP BY event_data->>'level'
ORDER BY level::int;
```

### 数据备份

Render 提供自动备份功能：
- **免费版**: 7天备份保留
- **付费版**: 更长的备份保留期

手动备份：
```bash
pg_dump "你的外部数据库URL" > backup.sql
```

## 🔍 故障排除

### 连接问题
- 确认 `DATABASE_URL` 环境变量设置正确
- 检查数据库和服务是否在同一区域
- 查看服务日志中的错误信息

### 表未创建
- 检查数据库用户是否有创建表的权限
- 查看服务启动日志中的错误信息

### 性能优化
- 考虑添加索引：
  ```sql
  CREATE INDEX idx_game_events_session_id ON game_events(session_id);
  CREATE INDEX idx_game_events_type ON game_events(event_type);
  CREATE INDEX idx_daily_stats_date ON daily_stats(stat_date);
  ```

## 📈 数据分析示例

```sql
-- 每日活跃用户趋势
SELECT stat_date, players, games, 
       ROUND(games::decimal / NULLIF(players, 0), 2) as avg_games_per_player
FROM daily_stats 
ORDER BY stat_date DESC;

-- 关卡通过率
SELECT 
    event_data->>'level' as level,
    COUNT(*) as completions,
    COUNT(DISTINCT session_id) as unique_players
FROM game_events 
WHERE event_type = 'level_complete'
GROUP BY event_data->>'level'
ORDER BY level::int;

-- 用户留存分析
SELECT 
    DATE(start_time) as date,
    COUNT(DISTINCT session_id) as new_sessions,
    COUNT(DISTINCT CASE WHEN event_type = 'ceo_promotion' THEN session_id END) as completed_game
FROM game_sessions s
LEFT JOIN game_events e ON s.session_id = e.session_id
GROUP BY DATE(start_time)
ORDER BY date DESC;
```

## 🚀 部署检查清单

- [ ] PostgreSQL 数据库已创建
- [ ] `DATABASE_URL` 环境变量已设置
- [ ] 服务重新部署成功
- [ ] 数据库连接日志显示成功
- [ ] 表自动创建成功
- [ ] 统计数据正常记录
- [ ] 管理面板可以访问数据 