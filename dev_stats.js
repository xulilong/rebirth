#!/usr/bin/env node

/**
 * 拯救Zack游戏 - 开发者统计工具
 * 用于收集、分析和管理游戏统计数据
 */

const fs = require('fs');
const path = require('path');

class GameStatsManager {
    constructor() {
        this.statsFile = path.join(__dirname, 'stats.json');
        this.currentStats = this.loadCurrentStats();
    }

    // 加载当前统计数据
    loadCurrentStats() {
        try {
            if (fs.existsSync(this.statsFile)) {
                const data = fs.readFileSync(this.statsFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.log('⚠️ 无法加载现有统计数据，将创建新的统计文件');
        }
        
        return {
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
            lastUpdated: ""
        };
    }

    // 更新统计数据
    updateStats(newData) {
        if (!newData || typeof newData !== 'object') {
            console.log('❌ 无效的统计数据');
            return false;
        }

        // 合并数据
        this.currentStats = {
            ...this.currentStats,
            ...newData,
            lastUpdated: new Date().toISOString()
        };

        return this.saveStats();
    }

    // 保存统计数据
    saveStats() {
        try {
            fs.writeFileSync(this.statsFile, JSON.stringify(this.currentStats, null, 2));
            console.log('✅ 统计数据已保存到', this.statsFile);
            return true;
        } catch (e) {
            console.log('❌ 保存统计数据失败:', e.message);
            return false;
        }
    }

    // 显示统计摘要
    showSummary() {
        console.log('\n=== 🎮 拯救Zack游戏统计摘要 ===');
        console.log(`📊 总玩家数: ${this.currentStats.totalPlayers}`);
        console.log(`🎮 总游戏次数: ${this.currentStats.totalGames}`);
        console.log(`🏆 总完成关卡: ${this.currentStats.totalLevelsCompleted}`);
        console.log(`🗝️ 总收集钥匙: ${this.currentStats.totalKeysCollected}`);
        console.log(`👑 总CEO晋升: ${this.currentStats.totalCEOPromotions}`);
        console.log(`📅 活跃天数: ${Object.keys(this.currentStats.dailyStats || {}).length}`);
        
        if (this.currentStats.totalGames > 0) {
            const avgLevels = (this.currentStats.totalLevelsCompleted / this.currentStats.totalGames).toFixed(2);
            const completionRate = ((this.currentStats.totalCEOPromotions / this.currentStats.totalGames) * 100).toFixed(2);
            console.log(`📈 平均每局关卡数: ${avgLevels}`);
            console.log(`✅ 游戏完成率: ${completionRate}%`);
        }

        console.log('\n📊 各关卡完成情况:');
        for (const [level, count] of Object.entries(this.currentStats.levelStats || {})) {
            console.log(`  第${level}关: ${count}次`);
        }

        console.log(`\n🕒 最后更新: ${this.currentStats.lastUpdated || '未知'}`);
        console.log('='.repeat(40));
    }

    // 生成详细报告
    generateReport() {
        const report = {
            generatedAt: new Date().toISOString(),
            summary: {
                totalPlayers: this.currentStats.totalPlayers,
                totalGames: this.currentStats.totalGames,
                totalLevelsCompleted: this.currentStats.totalLevelsCompleted,
                totalKeysCollected: this.currentStats.totalKeysCollected,
                totalCEOPromotions: this.currentStats.totalCEOPromotions,
                activeDays: Object.keys(this.currentStats.dailyStats || {}).length,
                averageLevelsPerGame: this.currentStats.totalGames > 0 ? 
                    (this.currentStats.totalLevelsCompleted / this.currentStats.totalGames).toFixed(2) : 0,
                completionRate: this.currentStats.totalGames > 0 ? 
                    ((this.currentStats.totalCEOPromotions / this.currentStats.totalGames) * 100).toFixed(2) + '%' : '0%'
            },
            detailedStats: this.currentStats
        };

        return report;
    }

    // 导出报告到文件
    exportReport(filename = null) {
        const report = this.generateReport();
        const exportFile = filename || `game_stats_report_${new Date().toISOString().split('T')[0]}.json`;
        
        try {
            fs.writeFileSync(exportFile, JSON.stringify(report, null, 2));
            console.log(`📄 报告已导出到: ${exportFile}`);
            return exportFile;
        } catch (e) {
            console.log('❌ 导出报告失败:', e.message);
            return null;
        }
    }

    // 重置统计数据
    resetStats() {
        this.currentStats = {
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
            lastUpdated: new Date().toISOString()
        };

        return this.saveStats();
    }
}

// 命令行接口
function main() {
    const statsManager = new GameStatsManager();
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'show':
        case 'summary':
            statsManager.showSummary();
            break;
            
        case 'report':
            const report = statsManager.generateReport();
            console.log(JSON.stringify(report, null, 2));
            break;
            
        case 'export':
            const filename = args[1];
            statsManager.exportReport(filename);
            break;
            
        case 'reset':
            if (args[1] === '--confirm') {
                statsManager.resetStats();
                console.log('🗑️ 统计数据已重置');
            } else {
                console.log('⚠️ 请使用 --confirm 参数确认重置操作');
                console.log('例如: node dev_stats.js reset --confirm');
            }
            break;
            
        case 'help':
        default:
            console.log('🎮 拯救Zack游戏 - 开发者统计工具');
            console.log('\n可用命令:');
            console.log('  show/summary  - 显示统计摘要');
            console.log('  report        - 生成详细报告(JSON格式)');
            console.log('  export [file] - 导出报告到文件');
            console.log('  reset --confirm - 重置所有统计数据');
            console.log('  help          - 显示此帮助信息');
            console.log('\n使用示例:');
            console.log('  node dev_stats.js show');
            console.log('  node dev_stats.js export monthly_report.json');
            break;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = GameStatsManager; 