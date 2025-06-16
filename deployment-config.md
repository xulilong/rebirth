# 🌐 部署配置说明

## 修改统计服务器地址

### 本地开发
```javascript
statsServerUrl: 'http://localhost:3001'
```

### 云平台部署
```javascript
// Vercel部署
statsServerUrl: 'https://你的项目名.vercel.app'

// Railway部署  
statsServerUrl: 'https://你的项目名.railway.app'

// Netlify部署
statsServerUrl: 'https://你的项目名.netlify.app'
```

### VPS服务器部署
```javascript
// 使用域名
statsServerUrl: 'https://你的域名.com'

// 使用IP地址
statsServerUrl: 'http://你的服务器IP:3001'
```

## 修改位置

在 `index.html` 文件的第1520行左右：

```javascript
const gameStats = {
    sessionId: null,
    statsServerUrl: '这里改成你的服务器地址', // 统计服务器地址
    // ...
};
```

在 `admin_dashboard.html` 文件中：

```javascript
const STATS_SERVER_URL = '这里改成你的服务器地址';
``` 