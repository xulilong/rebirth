const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 提供静态文件服务（游戏文件）
app.use(express.static('.', {
    index: 'index.html',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// 统计数据文件路径
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

// 读取统计数据
function loadStats() {
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
function saveStats(stats) {
    try {
        stats.lastUpdated = new Date().toISOString();
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
        return true;
    } catch (e) {
        console.log('❌ 保存统计数据失败:', e.message);
        return false;
    }
}

// 生成用户会话ID
function generateSessionId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// API路由

// 新用户访问
app.post('/api/stats/new-player', (req, res) => {
    try {
        const stats = loadStats();
        const sessionId = generateSessionId();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalPlayers++;
        
        // 记录每日统计
        if (!stats.dailyStats[today]) {
            stats.dailyStats[today] = { players: 0, games: 0, levels: 0 };
        }
        stats.dailyStats[today].players++;
        
        // 记录会话
        stats.sessions.push({
            sessionId,
            startTime: new Date().toISOString(),
            userAgent: req.headers['user-agent'] || 'unknown',
            ip: req.ip || req.connection.remoteAddress || 'unknown'
        });
        
        saveStats(stats);
        
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
app.post('/api/stats/game-start', (req, res) => {
    try {
        const { sessionId } = req.body;
        const stats = loadStats();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalGames++;
        
        if (!stats.dailyStats[today]) {
            stats.dailyStats[today] = { players: 0, games: 0, levels: 0 };
        }
        stats.dailyStats[today].games++;
        
        saveStats(stats);
        
        res.json({ 
            success: true, 
            message: '游戏开始统计已记录' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 关卡完成
app.post('/api/stats/level-complete', (req, res) => {
    try {
        const { sessionId, level } = req.body;
        const stats = loadStats();
        const today = new Date().toISOString().split('T')[0];
        
        stats.totalLevelsCompleted++;
        
        if (stats.levelStats[level.toString()]) {
            stats.levelStats[level.toString()]++;
        }
        
        if (!stats.dailyStats[today]) {
            stats.dailyStats[today] = { players: 0, games: 0, levels: 0 };
        }
        stats.dailyStats[today].levels++;
        
        saveStats(stats);
        
        res.json({ 
            success: true, 
            message: `第${level}关完成统计已记录` 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 钥匙收集
app.post('/api/stats/key-collected', (req, res) => {
    try {
        const { sessionId } = req.body;
        const stats = loadStats();
        
        stats.totalKeysCollected++;
        
        saveStats(stats);
        
        res.json({ 
            success: true, 
            message: '钥匙收集统计已记录' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// CEO晋升
app.post('/api/stats/ceo-promotion', (req, res) => {
    try {
        const { sessionId } = req.body;
        const stats = loadStats();
        
        stats.totalCEOPromotions++;
        
        saveStats(stats);
        
        res.json({ 
            success: true, 
            message: 'CEO晋升统计已记录' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 开发者专用：获取统计数据
app.get('/api/admin/stats', (req, res) => {
    try {
        const { adminKey } = req.query;
        
        // 简单的管理员验证（在生产环境中应该使用更安全的方式）
        if (adminKey !== 'zack_admin_2024') {
            return res.status(401).json({ error: '无权限访问' });
        }
        
        const stats = loadStats();
        
        // 计算统计摘要
        const summary = {
            totalPlayers: stats.totalPlayers,
            totalGames: stats.totalGames,
            totalLevelsCompleted: stats.totalLevelsCompleted,
            totalKeysCollected: stats.totalKeysCollected,
            totalCEOPromotions: stats.totalCEOPromotions,
            averageLevelsPerGame: stats.totalGames > 0 ? 
                (stats.totalLevelsCompleted / stats.totalGames).toFixed(2) : 0,
            completionRate: stats.totalGames > 0 ? 
                ((stats.totalCEOPromotions / stats.totalGames) * 100).toFixed(2) + '%' : '0%',
            activeDays: Object.keys(stats.dailyStats).length,
            mostPlayedLevel: getMostPlayedLevel(stats.levelStats)
        };
        
        res.json({
            success: true,
            summary,
            detailedStats: stats,
            generatedAt: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 开发者专用：重置统计数据
app.post('/api/admin/reset-stats', (req, res) => {
    try {
        const { adminKey } = req.body;
        
        if (adminKey !== 'zack_admin_2024') {
            return res.status(401).json({ error: '无权限访问' });
        }
        
        const resetStats = { ...initStats };
        saveStats(resetStats);
        
        res.json({ 
            success: true, 
            message: '统计数据已重置' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取最受欢迎的关卡
function getMostPlayedLevel(levelStats) {
    let maxLevel = "1";
    let maxCount = 0;
    
    for (const [level, count] of Object.entries(levelStats)) {
        if (count > maxCount) {
            maxCount = count;
            maxLevel = level;
        }
    }
    
    return `第${maxLevel}关 (${maxCount}次)`;
}

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🎮 拯救Zack统计服务器运行在端口 ${PORT}`);
    console.log(`📊 管理员面板: http://localhost:${PORT}/api/admin/stats?adminKey=zack_admin_2024`);
    console.log(`💡 健康检查: http://localhost:${PORT}/health`);
});

module.exports = app; 