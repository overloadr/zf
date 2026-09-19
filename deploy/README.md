# Ubuntu 24.04 部署

## 1. 安装 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx build-essential python3
node -v
```

`better-sqlite3` 需要编译原生模块，所以要有 `build-essential`。

## 2. 放置代码

```bash
sudo mkdir -p /opt/zf /var/lib/zf
sudo rsync -a --exclude node_modules --exclude data ./ /opt/zf/
sudo chown -R www-data:www-data /opt/zf /var/lib/zf
```

## 3. 安装依赖并构建前端

```bash
cd /opt/zf
sudo -u www-data npm ci
sudo -u www-data npm run build
```

生产环境由 Fastify 同时提供 API、WebSocket 和 `dist/web` 静态页，必须先 `npm run build`。

## 4. systemd

```bash
sudo cp deploy/zf.service /etc/systemd/system/zf.service
sudo systemctl daemon-reload
sudo systemctl enable --now zf
sudo systemctl status zf
```

数据库文件在 `/var/lib/zf/zf.db`。备份只需拷贝该文件（可同时拷贝 `-wal`/`-shm`）：

```bash
sudo sqlite3 /var/lib/zf/zf.db ".backup '/var/backups/zf-$(date +%F).db'"
```

管理员账号：复制 `config.example.json` 为 `/opt/zf/config.json`（或 `WorkingDirectory` 下），改好 `admin.username` / `admin.password`。也可用 systemd 环境变量 `ADMIN_USERNAME`、`ADMIN_PASSWORD`。

## 5. Nginx 反代

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/zf
sudo ln -sf /etc/nginx/sites-available/zf /etc/nginx/sites-enabled/zf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS 用 certbot 即可。WebSocket 必须走独立的 `location /ws`（样例已拆开，不要把 `Connection: upgrade` 套到 `/api`）。改完后执行 `sudo nginx -t && sudo systemctl reload nginx`。

## 6. 本机开发

```bash
npm install
npm test
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。手机同一局域网可访问电脑 IP 的 5173 端口。
