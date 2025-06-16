const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL 数据库配置
const DATABASE_URL = process.env.DATABASE_URL || null;
let pool = null;

// 如果有数据库配置，创建连接池
if (DATABASE_URL) {
    const { Pool } = require('pg');
    
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    // 测试数据库连接
    pool.connect()
        .then(client => {
            console.log('✅ PostgreSQL 连接成功');
            client.release();
            // 初始化数据库表
            initDatabase();
        })
        .catch(err => {
            console.log('⚠️ PostgreSQL 连接失败，使用文件存储:', err.message);
            pool = null;
        });
}

// 中间件
app.use(cors({
    origin: true, // 允许所有来源，适合部署环境
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// 请求日志中间件（仅在开发环境）
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// 提供静态文件服务（游戏文件）
app.use(express.static('.', {
    index: 'index.html',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        }
        // 添加缓存控制
        if (process.env.NODE_ENV === 'production') {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1小时缓存
        }
    }
}));

// 统计数据文件路径（备用存储）
const STATS_FILE = path.join(__dirname, 'server_stats.json');

// 初始化统计数据结构
const initStats = {
    totalPlayers: 0,
    totalGames: 0,
    totalLevelsCompleted: 0,
    totalKeysCollected: 0,
    totalCEOPromotions: 0,
    dailyStats: {},
    levelStats: {
        "1": 0, "2": 0, "3": 0, "4": 0, "5": 0,
        "6": 0, "7": 0, "8": 0, "9": 0, "10": 0
    },
    sessions: [],
    lastUpdated: ""
};

// 初始化数据库表
async function initDatabase() {
    if (!pool) return;
    
    try {
        const client = await pool.connect();
        
        // 创建统计表
        await client.query(`
            CREATE TABLE IF NOT EXISTS game_stats (
                id SERIAL PRIMARY KEY,
                stat_key VARCHAR(50) UNIQUE NOT NULL,
                stat_value JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 创建会话表
        await client.query(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100) UNIQUE NOT NULL,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_agent TEXT,
                ip_address INET,
                referrer TEXT,
                language VARCHAR(10),
                screen_size VARCHAR(20)
            )
        `);
        
        // 创建游戏事件表
        await client.query(`
            CREATE TABLE IF NOT EXISTS game_events (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                event_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 创建每日统计表
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_stats (
                id SERIAL PRIMARY KEY,
                stat_date DATE UNIQUE NOT NULL,
                players INTEGER DEFAULT 0,
                games INTEGER DEFAULT 0,
                levels INTEGER DEFAULT 0,
                keys INTEGER DEFAULT 0,
                ceo_promotions INTEGER DEFAULT 0
            )
        `);
        
        console.log('✅ 数据库表初始化完成');
        client.release();
    } catch (err) {
        console.log('❌ 数据库表初始化失败:', err.message);
    }
}

// 数据存储抽象层
class StatsStorage {
    // 读取统计数据
    async loadStats() {
        if (pool) {
            try {
                const client = await pool.connect();
                
                // 获取基础统计
                const statsResult = await client.query(
                    'SELECT stat_key, stat_value FROM game_stats'
                );
                
                // 获取每日统计
                const dailyResult = await client.query(
                    'SELECT stat_date, players, games, levels, keys, ceo_promotions FROM daily_stats ORDER BY stat_date'
                );
                
                // 获取关卡统计
                const levelResult = await client.query(`
                    SELECT event_data->>'level' as level, COUNT(*) as count 
                    FROM game_events 
                    WHERE event_type = 'level_complete' 
                    GROUP BY event_data->>'level'
                `);
                
                client.release();
                
                // 组装统计数据
                const stats = { ...initStats };
                
                // 基础统计
                statsResult.rows.forEach(row => {
                    if (row.stat_key === 'totals') {
                        const totals = typeof row.stat_value === 'string' 
                            ? JSON.parse(row.stat_value) 
                            : row.stat_value;
                        Object.assign(stats, totals);
                    }
                });
                
                // 每日统计
                stats.dailyStats = {};
                dailyResult.rows.forEach(row => {
                    const date = row.stat_date.toISOString().split('T')[0];
                    stats.dailyStats[date] = {
                        players: row.players,
                        games: row.games,
                        levels: row.levels,
                        keys: row.keys,
                        ceoPromotions: row.ceo_promotions
                    };
                });
                
                // 关卡统计
                levelResult.rows.forEach(row => {
                    if (row.level && stats.levelStats[row.level] !== undefined) {
                        stats.levelStats[row.level] = parseInt(row.count);
                    }
                });
                
                return stats;
            } catch (err) {
                console.log('⚠️ PostgreSQL 读取失败，使用文件存储:', err.message);
                return this.loadStatsFromFile();
            }
        } else {
            return this.loadStatsFromFile();
        }
    }

    // 从文件读取统计数据
    loadStatsFromFile() {
        try {
            if (fs.existsSync(STATS_FILE)) {
                const data = fs.readFileSync(STATS_FILE, 'utf8');
                return { ...initStats, ...JSON.parse(data) };
            }
        } catch (e) {
            console.log('⚠️ 无法加载统计数据，使用默认值');
        }
        return { ...initStats };
    }

    // 保存统计数据
    async saveStats(stats) {
        stats.lastUpdated = new Date().toISOString();
        
        if (pool) {
            try {
                const client = await pool.connect();
                
                // 保存基础统计
                const totals = {
                    totalPlayers: stats.totalPlayers,
                    totalGames: stats.totalGames,
                    totalLevelsCompleted: stats.totalLevelsCompleted,
                    totalKeysCollected: stats.totalKeysCollected,
                    totalCEOPromotions: stats.totalCEOPromotions,
                    lastUpdated: stats.lastUpdated
                };
                
                await client.query(`
                    INSERT INTO game_stats (stat_key, stat_value) 
                    VALUES ('totals', $1) 
                    ON CONFLICT (stat_key) 
                    DO UPDATE SET stat_value = $1, updated_at = CURRENT_TIMESTAMP
                `, [JSON.stringify(totals)]);
                
                client.release();
                
                // 同时保存到文件作为备份
                this.saveStatsToFile(stats);
                return true;
            } catch (err) {
                console.log('⚠️ PostgreSQL 保存失败，使用文件存储:', err.message);
                return this.saveStatsToFile(stats);
            }
        } else {
            return this.saveStatsToFile(stats);
        }
    }

    // 保存到文件
    saveStatsToFile(stats) {
        try {
            fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
            return true;
        } catch (e) {
            console.log('❌ 保存统计数据失败:', e.message);
            return false;
        }
    }

    // 记录会话
    async recordSession(sessionData) {
        if (pool) {
            try {
                const client = await pool.connect();
                await client.query(`
                    INSERT INTO game_sessions (session_id, user_agent, ip_address, referrer, language, screen_size)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (session_id) DO NOTHING
                `, [
                    sessionData.sessionId,
                    sessionData.userAgent,
                    sessionData.ip,
                    sessionData.referrer,
                    sessionData.language,
                    sessionData.screenSize
                ]);
                client.release();
            } catch (err) {
                console.log('⚠️ 会话记录失败:', err.message);
            }
        }
    }

    // 记录游戏事件
    async recordEvent(sessionId, eventType, eventData = {}) {
        if (pool) {
            try {
                const client = await pool.connect();
                await client.query(`
                    INSERT INTO game_events (session_id, event_type, event_data)
                    VALUES ($1, $2, $3)
                `, [sessionId, eventType, JSON.stringify(eventData)]);
                client.release();
            } catch (err) {
                console.log('⚠️ 事件记录失败:', err.message);
            }
        }
    }

    // 更新每日统计
    async updateDailyStats(date, field, increment = 1) {
        if (pool) {
            try {
                const client = await pool.connect();
                await client.query(`
                    INSERT INTO daily_stats (stat_date, ${field})
                    VALUES ($1, $2)
                    ON CONFLICT (stat_date)
                    DO UPDATE SET ${field} = daily_stats.${field} + $2
                `, [date, increment]);
                client.release();
            } catch (err) {
                console.log('⚠️ 每日统计更新失败:', err.message);
            }
        }
    }
}

const storage = new StatsStorage();

// 生成用户会话ID
function generateSessionId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// API路由

// 新用户访问
app.post('/api/stats/new-player', async (req, res) => {
    try {
        const stats = await storage.loadStats();
        const sessionId = generateSessionId();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalPlayers++;
        
        // 记录会话信息
        await storage.recordSession({
            sessionId,
            userAgent: req.headers['user-agent'] || 'unknown',
            ip: req.ip || req.connection.remoteAddress || 'unknown',
            referrer: req.body.referrer || 'direct',
            language: req.body.language || 'unknown',
            screenSize: req.body.screenSize || 'unknown'
        });
        
        // 更新每日统计
        await storage.updateDailyStats(today, 'players', 1);
        
        // 记录事件
        await storage.recordEvent(sessionId, 'new_player');
        
        await storage.saveStats(stats);
        
        res.json({ 
            success: true, 
            sessionId,
            message: '新玩家统计已记录' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 游戏开始
app.post('/api/stats/game-start', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const stats = await storage.loadStats();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalGames++;
        
        // 更新每日统计
        await storage.updateDailyStats(today, 'games', 1);
        
        // 记录事件
        await storage.recordEvent(sessionId, 'game_start');
        
        await storage.saveStats(stats);
        
        res.json({ 
            success: true, 
            message: '游戏开始统计已记录' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 关卡完成
app.post('/api/stats/level-complete', async (req, res) => {
    try {
        const { sessionId, level } = req.body;
        const stats = await storage.loadStats();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalLevelsCompleted++;
        
        if (stats.levelStats[level.toString()]) {
            stats.levelStats[level.toString()]++;
        }
        
        // 更新每日统计
        await storage.updateDailyStats(today, 'levels', 1);
        
        // 记录事件
        await storage.recordEvent(sessionId, 'level_complete', { level });
        
        await storage.saveStats(stats);
        
        res.json({ 
            success: true, 
            message: `第${level}关完成统计已记录` 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 钥匙收集
app.post('/api/stats/key-collected', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const stats = await storage.loadStats();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalKeysCollected++;
        
        // 更新每日统计
        await storage.updateDailyStats(today, 'keys', 1);
        
        // 记录事件
        await storage.recordEvent(sessionId, 'key_collected');
        
        await storage.saveStats(stats);
        
        res.json({ 
            success: true, 
            message: '钥匙收集统计已记录' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// CEO晋升
app.post('/api/stats/ceo-promotion', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const stats = await storage.loadStats();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalCEOPromotions++;
        
        // 更新每日统计
        await storage.updateDailyStats(today, 'ceo_promotions', 1);
        
        // 记录事件
        await storage.recordEvent(sessionId, 'ceo_promotion');
        
        await storage.saveStats(stats);
        
        res.json({ 
            success: true, 
            message: 'CEO晋升统计已记录' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 开发者专用：获取统计数据
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { adminKey } = req.query;
        
        // 简单的管理员验证
        if (adminKey !== '123456') {
            return res.status(401).json({ error: '无权限访问' });
        }
        
        const stats = await storage.loadStats();
        
        // 计算统计摘要
        const summary = {
            totalPlayers: stats.totalPlayers,
            totalGames: stats.totalGames,
            totalLevelsCompleted: stats.totalLevelsCompleted,
            totalKeysCollected: stats.totalKeysCollected,
            totalCEOPromotions: stats.totalCEOPromotions,
            dailyStats: stats.dailyStats,
            levelStats: stats.levelStats,
            lastUpdated: stats.lastUpdated
        };
        
        res.json({
            success: true,
            data: summary
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: pool ? 'connected' : 'file_storage'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 统计服务器运行在端口 ${PORT}`);
    console.log(`📊 数据库: ${pool ? 'PostgreSQL' : '文件存储'}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，正在关闭服务器...');
    if (pool) {
        pool.end();
    }
    process.exit(0);
});

module.exports = app; 