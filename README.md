# 荷塘月色

基于朱自清《荷塘月色》的 Three.js 交互阅读体验，结合实时生成的场景和 Web Audio 环境音。

公开页面：https://bennix.github.io/hetang/

## 本地运行

需要 Node.js 22 和 Python 3：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:5173，点击「月下踱步」进入并开启声音。

## 构建与部署

```sh
npm run build
python3 -m http.server 5173 --directory dist
```

`dist/` 为完整静态站点，包含 Three.js 依赖，可以部署到子目录。推送到 `main` 后，GitHub Actions 自动构建并部署到 GitHub Pages；仓库 Pages 的 Source 应设为 GitHub Actions。

需要支持 WebGL 2 和 Web Audio 的现代浏览器。Google Fonts 加载失败时使用系统字体。
