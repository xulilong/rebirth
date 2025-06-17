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
    // 新增：关卡尝试次数统计
    levelAttempts: {
        "1": 0, "2": 0, "3": 0, "4": 0, "5": 0,
        "6": 0, "7": 0, "8": 0, "9": 0, "10": 0
    },
    // 新增：关卡平均尝试次数
    levelAverageAttempts: {
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
        
        // 创建玩家游戏记录表（用于排行榜）
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_records (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100) NOT NULL,
                player_name VARCHAR(100),
                total_deaths INTEGER DEFAULT 0,
                level_deaths JSONB DEFAULT '{}',
                level_attempts JSONB DEFAULT '{}',
                completed_at TIMESTAMP,
                is_completed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    async savePlayerRecord(playerData) {
        try {
            const leaderboardFile = path.join(__dirname, 'leaderboard.json');
            let leaderboard = [];
            
            // 读取现有排行榜数据
            if (fs.existsSync(leaderboardFile)) {
                const content = fs.readFileSync(leaderboardFile, 'utf8');
                leaderboard = JSON.parse(content);
            }
            
            // 检查是否已有相同sessionId的记录
            const existingIndex = leaderboard.findIndex(record => 
                record.sessionId === playerData.sessionId
            );
            
            const newRecord = {
                sessionId: playerData.sessionId,
                playerName: playerData.playerName,
                totalDeaths: playerData.totalDeaths,
                levelDeaths: playerData.levelDeaths,
                completedAt: playerData.completedAt,
                createdAt: new Date().toISOString()
            };
            
            if (existingIndex >= 0) {
                // 更新现有记录
                leaderboard[existingIndex] = newRecord;
            } else {
                // 添加新记录
                leaderboard.push(newRecord);
            }
            
            // 按总死亡次数排序，然后按完成时间排序
            leaderboard.sort((a, b) => {
                if (a.totalDeaths === b.totalDeaths) {
                    return new Date(a.completedAt) - new Date(b.completedAt);
                }
                return a.totalDeaths - b.totalDeaths;
            });
            
            // 保存排行榜数据
            fs.writeFileSync(leaderboardFile, JSON.stringify(leaderboard, null, 2));
            
            console.log(`排行榜记录已保存: ${playerData.playerName} - ${playerData.totalDeaths}次死亡`);
        } catch (error) {
            console.error('保存排行榜记录失败:', error);
            throw error;
        }
    }

    async loadLeaderboard(limit = 10) {
        try {
            const leaderboardFile = path.join(__dirname, 'leaderboard.json');
            
            if (!fs.existsSync(leaderboardFile)) {
                return { leaderboard: [], levelStats: {} };
            }
            
            const content = fs.readFileSync(leaderboardFile, 'utf8');
            const records = JSON.parse(content);
            
            // 取前N名
            const topRecords = records.slice(0, limit);
            
            // 格式化排行榜数据
            const leaderboard = topRecords.map((record, index) => ({
                rank: index + 1,
                playerName: record.playerName,
                totalDeaths: record.totalDeaths,
                levelDeaths: record.levelDeaths,
                completedAt: record.completedAt
            }));
            
            // 计算关卡统计
            const levelStats = {};
            if (records.length > 0) {
                // 计算每关的平均死亡次数
                for (let level = 1; level <= 10; level++) {
                    const levelKey = level.toString();
                    const levelDeaths = records
                        .map(record => record.levelDeaths[levelKey] || 0)
                        .filter(deaths => deaths !== undefined);
                    
                    if (levelDeaths.length > 0) {
                        const avgDeaths = levelDeaths.reduce((sum, deaths) => sum + deaths, 0) / levelDeaths.length;
                        levelStats[levelKey] = {
                            averageDeaths: avgDeaths.toFixed(1),
                            playerCount: levelDeaths.length
                        };
                    }
                }
            }
            
            return { leaderboard, levelStats };
        } catch (error) {
            console.error('读取排行榜失败:', error);
            return { leaderboard: [], levelStats: {} };
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

// 关卡开始/尝试
app.post('/api/stats/level-attempt', async (req, res) => {
    try {
        const { sessionId, level, attemptCount } = req.body;
        const stats = await storage.loadStats();
        
        // 记录关卡尝试次数
        if (stats.levelAttempts[level.toString()]) {
            stats.levelAttempts[level.toString()]++;
        }
        
        // 记录事件
        await storage.recordEvent(sessionId, 'level_attempt', { level, attemptCount });
        
        await storage.saveStats(stats);
        
        res.json({ 
            success: true, 
            message: `第${level}关尝试统计已记录` 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 关卡完成
app.post('/api/stats/level-complete', async (req, res) => {
    try {
        const { sessionId, level, attemptCount } = req.body;
        const stats = await storage.loadStats();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalLevelsCompleted++;
        
        if (stats.levelStats[level.toString()]) {
            stats.levelStats[level.toString()]++;
        }
        
        // 计算平均尝试次数
        if (stats.levelAttempts[level.toString()] && stats.levelStats[level.toString()]) {
            stats.levelAverageAttempts[level.toString()] = 
                (stats.levelAttempts[level.toString()] / stats.levelStats[level.toString()]).toFixed(1);
        }
        
        // 更新每日统计
        await storage.updateDailyStats(today, 'levels', 1);
        
        // 记录事件
        await storage.recordEvent(sessionId, 'level_complete', { level, attemptCount });
        
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

// 更新玩家记录
app.post('/api/stats/player-record', async (req, res) => {
    try {
        const { sessionId, playerName, level, deaths, isCompleted } = req.body;
        
        if (pool) {
            const client = await pool.connect();
            
            // 检查是否已有记录
            const existingRecord = await client.query(
                'SELECT * FROM player_records WHERE session_id = $1',
                [sessionId]
            );
            
            if (existingRecord.rows.length > 0) {
                // 更新现有记录
                const currentRecord = existingRecord.rows[0];
                const levelDeaths = typeof currentRecord.level_deaths === 'string' 
                    ? JSON.parse(currentRecord.level_deaths) 
                    : currentRecord.level_deaths || {};
                const levelAttempts = typeof currentRecord.level_attempts === 'string' 
                    ? JSON.parse(currentRecord.level_attempts) 
                    : currentRecord.level_attempts || {};
                
                levelDeaths[level] = deaths;
                levelAttempts[level] = deaths + 1; // 尝试次数 = 死亡次数 + 1
                
                const totalDeaths = Object.values(levelDeaths).reduce((sum, d) => sum + d, 0);
                
                await client.query(`
                    UPDATE player_records 
                    SET player_name = $1, total_deaths = $2, level_deaths = $3, 
                        level_attempts = $4, is_completed = $5, 
                        completed_at = $6, updated_at = CURRENT_TIMESTAMP
                    WHERE session_id = $7
                `, [
                    playerName || currentRecord.player_name,
                    totalDeaths,
                    JSON.stringify(levelDeaths),
                    JSON.stringify(levelAttempts),
                    isCompleted,
                    isCompleted ? new Date() : currentRecord.completed_at,
                    sessionId
                ]);
            } else {
                // 创建新记录
                const levelDeaths = { [level]: deaths };
                const levelAttempts = { [level]: deaths + 1 };
                
                await client.query(`
                    INSERT INTO player_records 
                    (session_id, player_name, total_deaths, level_deaths, level_attempts, is_completed, completed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    sessionId,
                    playerName,
                    deaths,
                    JSON.stringify(levelDeaths),
                    JSON.stringify(levelAttempts),
                    isCompleted,
                    isCompleted ? new Date() : null
                ]);
            }
            
            client.release();
        }
        
        res.json({ 
            success: true, 
            message: '玩家记录已更新' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 游戏完成记录
app.post('/api/stats/game-complete', async (req, res) => {
    try {
        const { sessionId, playerName, totalDeaths, levelDeaths, completedAt } = req.body;
        
        if (pool) {
            const client = await pool.connect();
            
            // 检查是否已有记录
            const existingRecord = await client.query(
                'SELECT * FROM player_records WHERE session_id = $1',
                [sessionId]
            );
            
            if (existingRecord.rows.length > 0) {
                // 更新现有记录为完成状态
                await client.query(`
                    UPDATE player_records 
                    SET player_name = $1, total_deaths = $2, level_deaths = $3, 
                        is_completed = true, completed_at = $4, updated_at = CURRENT_TIMESTAMP
                    WHERE session_id = $5
                `, [
                    playerName,
                    totalDeaths,
                    JSON.stringify(levelDeaths),
                    new Date(completedAt),
                    sessionId
                ]);
            } else {
                // 创建新的完成记录
                await client.query(`
                    INSERT INTO player_records 
                    (session_id, player_name, total_deaths, level_deaths, is_completed, completed_at)
                    VALUES ($1, $2, $3, $4, true, $5)
                `, [
                    sessionId,
                    playerName,
                    totalDeaths,
                    JSON.stringify(levelDeaths),
                    new Date(completedAt)
                ]);
            }
            
            client.release();
        } else {
            // 文件存储模式：保存到排行榜文件
            await storage.savePlayerRecord({
                sessionId,
                playerName,
                totalDeaths,
                levelDeaths,
                completedAt
            });
        }
        
        res.json({ 
            success: true, 
            message: '游戏完成记录已保存' 
        });
    } catch (e) {
        console.error('游戏完成记录失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取排行榜
app.get('/api/leaderboard', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        if (pool) {
            const client = await pool.connect();
            
            // 获取完成游戏的玩家排行榜（按总死亡次数排序）
            const leaderboard = await client.query(`
                SELECT 
                    player_name,
                    total_deaths,
                    level_deaths,
                    level_attempts,
                    completed_at,
                    EXTRACT(EPOCH FROM (completed_at - created_at)) as completion_time_seconds
                FROM player_records 
                WHERE is_completed = true AND player_name IS NOT NULL
                ORDER BY total_deaths ASC, completed_at ASC
                LIMIT $1
            `, [parseInt(limit)]);
            
            // 获取每关平均死亡次数统计
            const levelStats = await client.query(`
                SELECT 
                    level_key,
                    AVG(CAST(level_value AS INTEGER)) as avg_deaths,
                    COUNT(*) as player_count
                FROM (
                    SELECT 
                        jsonb_each_text(level_deaths) as level_data
                    FROM player_records 
                    WHERE is_completed = true
                ) as level_data_expanded,
                LATERAL (
                    SELECT 
                        (level_data).key as level_key,
                        (level_data).value as level_value
                ) as level_parsed
                WHERE level_key ~ '^[0-9]+$'
                GROUP BY level_key
                ORDER BY CAST(level_key AS INTEGER)
            `);
            
            client.release();
            
            const formattedLeaderboard = leaderboard.rows.map((row, index) => ({
                rank: index + 1,
                playerName: row.player_name,
                totalDeaths: row.total_deaths,
                levelDeaths: typeof row.level_deaths === 'string' 
                    ? JSON.parse(row.level_deaths) 
                    : row.level_deaths,
                levelAttempts: typeof row.level_attempts === 'string' 
                    ? JSON.parse(row.level_attempts) 
                    : row.level_attempts,
                completedAt: row.completed_at,
                completionTimeMinutes: row.completion_time_seconds ? 
                    Math.round(row.completion_time_seconds / 60) : null
            }));
            
            const formattedLevelStats = {};
            levelStats.rows.forEach(row => {
                formattedLevelStats[row.level_key] = {
                    averageDeaths: parseFloat(row.avg_deaths).toFixed(1),
                    playerCount: parseInt(row.player_count)
                };
            });
            
            res.json({
                success: true,
                data: {
                    leaderboard: formattedLeaderboard,
                    levelStats: formattedLevelStats
                }
            });
        } else {
            // 文件存储模式：从文件读取排行榜数据
            const leaderboardData = await storage.loadLeaderboard(parseInt(limit));
            res.json({
                success: true,
                data: leaderboardData
            });
        }
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
        
        // 获取排行榜数据
        let leaderboardData = { leaderboard: [], levelStats: {} };
        if (pool) {
            try {
                const client = await pool.connect();
                
                // 获取完成游戏的玩家排行榜（按总死亡次数排序）
                const leaderboard = await client.query(`
                    SELECT 
                        player_name,
                        total_deaths,
                        level_deaths,
                        level_attempts,
                        completed_at,
                        EXTRACT(EPOCH FROM (completed_at - created_at)) as completion_time_seconds
                    FROM player_records 
                    WHERE is_completed = true AND player_name IS NOT NULL
                    ORDER BY total_deaths ASC, completed_at ASC
                    LIMIT 10
                `);
                
                // 获取每关平均死亡次数统计
                const levelStats = await client.query(`
                    SELECT 
                        level_key,
                        AVG(CAST(level_value AS INTEGER)) as avg_deaths,
                        COUNT(*) as player_count
                    FROM (
                        SELECT 
                            jsonb_each_text(level_deaths) as level_data
                        FROM player_records 
                        WHERE is_completed = true
                    ) as level_data_expanded,
                    LATERAL (
                        SELECT 
                            (level_data).key as level_key,
                            (level_data).value as level_value
                    ) as level_parsed
                    WHERE level_key ~ '^[0-9]+$'
                    GROUP BY level_key
                    ORDER BY CAST(level_key AS INTEGER)
                `);
                
                client.release();
                
                const formattedLeaderboard = leaderboard.rows.map((row, index) => ({
                    rank: index + 1,
                    playerName: row.player_name,
                    totalDeaths: row.total_deaths,
                    levelDeaths: typeof row.level_deaths === 'string' 
                        ? JSON.parse(row.level_deaths) 
                        : row.level_deaths,
                    levelAttempts: typeof row.level_attempts === 'string' 
                        ? JSON.parse(row.level_attempts) 
                        : row.level_attempts,
                    completedAt: row.completed_at,
                    completionTimeMinutes: row.completion_time_seconds ? 
                        Math.round(row.completion_time_seconds / 60) : null
                }));
                
                const formattedLevelStats = {};
                levelStats.rows.forEach(row => {
                    formattedLevelStats[row.level_key] = {
                        averageDeaths: parseFloat(row.avg_deaths).toFixed(1),
                        playerCount: parseInt(row.player_count)
                    };
                });
                
                leaderboardData = {
                    leaderboard: formattedLeaderboard,
                    levelStats: formattedLevelStats
                };
            } catch (e) {
                console.log('获取排行榜数据失败:', e.message);
            }
        }
        
        // 计算统计摘要
        const summary = {
            totalPlayers: stats.totalPlayers,
            totalGames: stats.totalGames,
            totalLevelsCompleted: stats.totalLevelsCompleted,
            totalKeysCollected: stats.totalKeysCollected,
            totalCEOPromotions: stats.totalCEOPromotions,
            dailyStats: stats.dailyStats,
            levelStats: stats.levelStats,
            levelAttempts: stats.levelAttempts,
            levelAverageAttempts: stats.levelAverageAttempts,
            leaderboard: leaderboardData.leaderboard,
            levelDeathStats: leaderboardData.levelStats,
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